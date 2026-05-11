import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

/* ─────────────────────────────────────────────────────────────
   All server-emitted events the hook subscribes to
───────────────────────────────────────────────────────────── */
const SERVER_EVENTS = [
  'debate_joined',
  'transcript_live',
  'transcript_final',
  'fallacy_detected',
  'scores_update',
  'ai_thinking',
  'ai_text_chunk',
  'ai_audio_chunk',
  'ai_translating',
  'ai_turn_complete',
  'debate_ended',
  'phase_update',
  'judge_verdict',
  'ai_translation',
  'user_translation',
  'error',
];

/**
 * useDebateSocket
 *
 * Manages:
 *  - Socket.IO connection (WebSocket transport)
 *  - MediaRecorder audio streaming to server
 *  - Web Speech API live transcript (parallel / fallback)
 *  - AudioContext queue playback for AI audio chunks
 *
 * @param {string}   debateId
 * @param {Function} onEvent(eventName, data) — called for every server event
 *
 * @returns {{
 *   connected:      boolean,
 *   startRecording: () => Promise<void>,
 *   stopRecording:  () => void,
 *   endDebate:      () => void,
 *   liveTranscript: string,
 *   isAISpeaking:   boolean,
 *   audioSupported: boolean,
 * }}
 */
export function useDebateSocket(debateId, { onEvent, selectedVoiceURI, preferredLang } = {}) {
  /* ── public state ── */
  const [connected,      setConnected]      = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isAISpeaking,   setIsAISpeaking]   = useState(false);
  const [availableVoices, setAvailableVoices] = useState([]);
  const [audioSupported] = useState(
    () => typeof MediaRecorder !== 'undefined' || 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window
  );

  /* ── internal refs (never cause re-renders) ── */
  const socketRef        = useRef(null);
  const mediaRecRef      = useRef(null);   // MediaRecorder instance
  const recognitionRef   = useRef(null);   // SpeechRecognition instance
  const streamRef        = useRef(null);   // getUserMedia stream
  const audioCtxRef      = useRef(null);   // AudioContext
  const audioQueueRef    = useRef([]);     // Not used for Web Speech API, but keeping for reference or future use
  const sentenceBufRef   = useRef('');     // Buffer for incoming text chunks
  const isPlayingRef     = useRef(false);  // guard against concurrent plays
  const isRecordingRef   = useRef(false);  // track if a recording is actually active
  const usedMediaRecorderRef = useRef(false); // true when this recording session used MediaRecorder
  const detectedLanguageRef  = useRef(preferredLang || 'en'); // updated on transcript_final
  const tzOffsetMinutesRef   = useRef(-new Date().getTimezoneOffset()); // offset minutes: local = UTC + tzOffsetMinutes
  const onEventRef       = useRef(onEvent);
  const selectedVoiceURIRef = useRef(selectedVoiceURI);
  const liveTranscriptRef = useRef('');
  const preferredLangRef = useRef(preferredLang || null);
  const voiceEnabledRef = useRef(true);
  const ttsLanguageOverrideRef = useRef('auto'); // 'auto' or iso 639-1 language code
  const connectCountRef = useRef(0); // tracks reconnections
  const lastErrorTimeRef = useRef(0); // debounce error events
  const spokenUpToRef = useRef(0); // how many chars of AI text we've already spoken (prevent double-flush)
  const shouldKeepRecognizingRef = useRef(false);

  /* keep refs fresh without re-running socket effect */
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { selectedVoiceURIRef.current = selectedVoiceURI; }, [selectedVoiceURI]);
  useEffect(() => { preferredLangRef.current = preferredLang || null; }, [preferredLang]);

  function resolveSocketUrl() {
    const wsUrl = String(process.env.REACT_APP_WS_URL || '').trim();
    const apiUrl = String(import.meta.env.VITE_API_URL || '').trim();

    if (typeof window === 'undefined') {
      return wsUrl || apiUrl || '';
    }

    const pageUrl = new URL(window.location.href);
    const wsTarget = wsUrl ? new URL(wsUrl, window.location.href) : null;
    const apiTarget = apiUrl ? new URL(apiUrl, window.location.href) : null;

    const isLocalPage = ['localhost', '127.0.0.1'].includes(pageUrl.hostname);
    const usesSeparateLocalBackend = [wsTarget, apiTarget].some(
      (target) =>
        target &&
        ['localhost', '127.0.0.1'].includes(target.hostname) &&
        target.origin !== pageUrl.origin
    );

    // In local dev, prefer same-origin so Vite can proxy /socket.io reliably.
    if (isLocalPage && usesSeparateLocalBackend) {
      return pageUrl.origin;
    }

    return wsUrl || apiUrl || pageUrl.origin;
  }

  /* ─────────────────────────────────────────────
     Audio playback helpers
  ───────────────────────────────────────────── */

  const playNextInQueue = useCallback(() => {
    if (audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      setIsAISpeaking(false);
      return;
    }

    isPlayingRef.current = true;
    setIsAISpeaking(true);
    const { url, blobUrl } = audioQueueRef.current.shift();

    const audio = new Audio();
    audio.crossOrigin = "anonymous";
    audio.src = url;
    
    audio.onended = () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      playNextInQueue(); // Play next
    };

    audio.onerror = (e) => {
      console.error('[useDebateSocket] Audio play error:', e);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      playNextInQueue();
    };

    audio.play().catch(err => {
      console.warn('[useDebateSocket] Audio play blocked/failed:', err);
      playNextInQueue();
    });
  }, []);

  function normalizeLangIso(lang) {
    const raw = String(lang || '').trim();
    if (!raw) return 'en';
    // Speech providers often return BCP-47; we store iso-639-1 where possible.
    // e.g. en-US -> en, pt-BR -> pt
    return raw.split('-')[0].toLowerCase();
  }

  function speechRecognitionLangFromIso(iso) {
    const code = normalizeLangIso(iso);
    // Common app languages: map to best-effort BCP-47 tags.
    const map = {
      en: 'en-US',
      hi: 'hi-IN',
      ta: 'ta-IN',
      te: 'te-IN',
      kn: 'kn-IN',
      ml: 'ml-IN',
      mr: 'mr-IN',
      bn: 'bn-IN',
      gu: 'gu-IN',
      pa: 'pa-IN',
      ur: 'ur-PK',
      fr: 'fr-FR',
      de: 'de-DE',
      es: 'es-ES',
      pt: 'pt-PT',
      it: 'it-IT',
      nl: 'nl-NL',
      ru: 'ru-RU',
      ja: 'ja-JP',
      ko: 'ko-KR',
      zh: 'zh-CN',
      ar: 'ar-SA',
      tr: 'tr-TR',
      pl: 'pl-PL',
      sv: 'sv-SE',
      da: 'da-DK',
    };
    return map[code] || iso || 'en-US';
  }

  function pickVoiceForLang(voices, targetIso) {
    const target = normalizeLangIso(targetIso);
    if (!Array.isArray(voices) || voices.length === 0) return null;

    // Prefer exact voice.lang match
    let v = voices.find((x) => normalizeLangIso(x.lang) === target);
    if (v) return v;

    // Prefer prefix match (e.g. pt-BR starts with pt)
    v = voices.find((x) => normalizeLangIso(x.lang).startsWith(target));
    if (v) return v;

    // Fallback: any voice in same language family prefix
    v = voices.find((x) => (x.lang || '').toLowerCase().startsWith(target));
    if (v) return v;

    return null;
  }

  /* Warm up voices for Chrome/Safari */
  useEffect(() => {
    const synth = window.speechSynthesis;
    const updateVoices = () => {
      const voices = synth.getVoices().filter(v => v.lang);
      setAvailableVoices(voices);
    };

    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = updateVoices;
    }
    updateVoices();
  }, []);

  /** Speak a single sentence using Web Speech API */
  const speakSentence = useCallback((text) => {
    // COMPLETELY DISABLED: Using server-side TTS only to prevent double voices
  }, []);

  /** Strip Ollama meta-commentary parentheticals and clean text for TTS */
  function sanitizeTTSText(raw) {
    return raw
      .replace(/\([^)]{0,200}\)/g, '')   // remove (Note: ...) style asides
      .replace(/\[[^\]]{0,200}\]/g, '')   // remove [Note: ...] style asides
      .replace(/\s{2,}/g, ' ')            // collapse multiple spaces
      .trim();
  }

  const handleAiTextChunk = useCallback((text) => {
    sentenceBufRef.current += text;

    // Match complete sentences ending in . ! or ? 
    const sentences = sentenceBufRef.current.match(/[^.!?]+[.!?]/g);

    if (sentences) {
      sentences.forEach(s => {
        const cleaned = sanitizeTTSText(s);
        // DISABLED: Using high-quality OpenAI TTS instead via ai_audio_chunk
        // if (cleaned) speakSentence(cleaned);
      });
      // Remove spoken portion from buffer
      sentenceBufRef.current = sentenceBufRef.current.slice(sentences.join('').length);
    }
  }, [speakSentence]);

  /* ─────────────────────────────────────────────
     Socket setup / teardown
  ───────────────────────────────────────────── */
  useEffect(() => {
    if (!debateId) return;

    const socket = io(resolveSocketUrl(), {
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      auth: {
        token: localStorage.getItem('debateforge_token') || localStorage.getItem('token'),
      },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      const isReconnect = connectCountRef.current > 0;
      connectCountRef.current += 1;
      // Always (re)join — handles both initial join and reconnections.
      // Send the actual preferredLang (never null when user has selected one).
      const langToSend = preferredLangRef.current || null;
      socket.emit('join_debate', {
        debateId,
        preferredLang: langToSend,
        tzOffsetMinutes: tzOffsetMinutesRef.current,
      });
      // On reconnect: re-send the language preference so the backend session
      // picks it up immediately even if the session was reset.
      if (isReconnect && langToSend && langToSend !== 'en') {
        setTimeout(() => {
          socket.emit('set_language', { debateId, lang: langToSend });
        }, 500);
      }
    });

    socket.on('disconnect', (reason) => {
      if (process.env.NODE_ENV === 'development') {
        console.log('[useDebateSocket] disconnected:', reason);
      }
      setConnected(false);
    });

    socket.on('connect_error', (err) => {
      console.error('[useDebateSocket] connect_error:', err?.message || err);
      setConnected(false);
      onEventRef.current?.('error', {
        message: `Socket connection failed: ${err?.message || 'unknown error'}`,
      });
    });

    /* subscribe to all server events */
    SERVER_EVENTS.forEach((event) => {
      socket.on(event, (data) => {
        if (event === 'transcript_final') {
          const lang = data?.language;
          if (lang) detectedLanguageRef.current = lang;
        }

        /* Browser-based TTS — speak incoming text chunks as sentences form */
        if (event === 'ai_thinking') {
          // New AI turn starting — reset buffer and cancel any queued speech
          sentenceBufRef.current = '';
          spokenUpToRef.current = 0;
          try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
        }

        if (event === 'ai_text_chunk') {
          // Skip placeholder dots — they are not real AI text
          if (!data.isPlaceholder) {
            handleAiTextChunk(data.text ?? data.chunk ?? '');
          }
        }

        /* Flush any remaining text when the turn is done.
           For non-English debates, the sentence buffer is empty (raw chunks
           were suppressed). In that case, speak the full translated text. */
        if (event === 'ai_turn_complete') {
          if (data?.detectedLanguage) {
            detectedLanguageRef.current = data.detectedLanguage;
          }
          // Flush any remaining text in the buffer (the last partial sentence)
          const remaining = sanitizeTTSText(sentenceBufRef.current);
          if (remaining && detectedLanguageRef.current === 'en') {
            // DISABLED: Using high-quality OpenAI TTS
            // speakSentence(remaining);
          } else if (data?.fullText && detectedLanguageRef.current !== 'en') {
            // DISABLED: Using high-quality OpenAI TTS
            // const fullClean = sanitizeTTSText(data.fullText);
            // if (fullClean) speakSentence(fullClean);
          }
          sentenceBufRef.current = '';
          spokenUpToRef.current = 0;
        }

        if (event === 'ai_audio_chunk') {
          if (data?.audio || data?.audioUrl) {
            const dataLen = data.audio ? data.audio.length : 'URL';
            console.log(`[useDebateSocket] Queuing Audio Chunk | Len: ${dataLen}`);
            
            let url = data.audioUrl;
            let blobUrl = null;

            if (data.audio) {
              const blob = b64toBlob(data.audio, data.contentType || 'audio/mpeg');
              blobUrl = URL.createObjectURL(blob);
              url = blobUrl;
            }

            // Add to playback queue
            audioQueueRef.current.push({ url, blobUrl });
            
            // Trigger playback if not already active
            if (!isPlayingRef.current) {
              playNextInQueue();
            }
          }
        }

        if (event === 'ai_turn_complete' || event === 'error') {
          if (socketRef.current) socketRef.current._submittingTurn = false;
        }

        /* Propagate every event to caller (debounce errors) */
        if (event === 'error') {
          const now = Date.now();
          if (now - lastErrorTimeRef.current < 3000) return; // suppress flood
          lastErrorTimeRef.current = now;
        }
        onEventRef.current?.(event, data);
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId]);

  /* ─────────────────────────────────────────────
     Recording helpers
  ───────────────────────────────────────────── */

  /** Sets up Web Speech API for live transcript. Safe if not supported. */
  const startSpeechRecognition = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition       = new SR();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    if (preferredLangRef.current) {
      recognition.lang = speechRecognitionLangFromIso(preferredLangRef.current);
    }

    recognition.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('');
      setLiveTranscript(transcript);
      liveTranscriptRef.current = transcript;
    };

    recognition.onerror = (e) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[SpeechRecognition error]:', e.error);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!shouldKeepRecognizingRef.current || !isRecordingRef.current) return;
      try {
        startSpeechRecognition();
      } catch (err) {
        console.warn('[SpeechRecognition restart failed]:', err);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, []);

  const warmUpAudio = useCallback(() => {
    // Play a tiny silent sound to "unlock" the browser's audio context
    const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
    audio.play().catch(() => {});
  }, []);

  /** PRIMARY path: MediaRecorder + parallel SpeechRecognition */
  const startRecordingWithMediaRecorder = useCallback(async () => {
    warmUpAudio(); // UNLOCK AUDIO HERE
    isRecordingRef.current = true;
    usedMediaRecorderRef.current = true;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    /* Prefer opus/webm; fall back to browser default */
    const mimeType   = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : '';
    const recOptions = mimeType ? { mimeType } : {};
    const rec        = new MediaRecorder(stream, recOptions);
    mediaRecRef.current = rec;

    const socket = socketRef.current;

    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0 && socket) {
        socket.emit('audio_chunk', { debateId, chunk: e.data });
      }
    };

    // NOTE: Do NOT emit audio_end here.
    // stopRecording() handles submission to avoid sending both
    // audio_end AND transcript_direct (which caused duplicate AI responses).
    rec.onstop = () => {};

    rec.start();  // emit once on stop (avoids Safari timeslice bugs)

    /* Parallel live transcript */
    startSpeechRecognition();
  }, [debateId, startSpeechRecognition]);

  /** FALLBACK path: SpeechRecognition only → emit transcript_direct on final result */
  const startRecordingFallback = useCallback(() => {
    isRecordingRef.current = true;
    usedMediaRecorderRef.current = false;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;

    const recognition       = new SR();
    recognition.continuous      = true;
    recognition.interimResults  = true;
    if (preferredLangRef.current) {
      recognition.lang = speechRecognitionLangFromIso(preferredLangRef.current);
    }

    recognition.onresult = (e) => {
      let interim = '';
      let final   = '';
      for (const result of e.results) {
        if (result.isFinal) final   += result[0].transcript;
        else                 interim += result[0].transcript;
      }
      const next = interim || final;
      setLiveTranscript(next);
      liveTranscriptRef.current = next;
    };

    recognition.onerror = (e) => {
      console.warn('[useDebateSocket] SpeechRecognition fallback error:', e.error);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (!shouldKeepRecognizingRef.current || !isRecordingRef.current) return;
      try {
        startRecordingFallback();
      } catch (err) {
        console.warn('[useDebateSocket] SpeechRecognition fallback restart failed:', err);
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
  }, [debateId]);

  /* ─────────────────────────────────────────────
     Public API
  ───────────────────────────────────────────── */

  const startRecording = useCallback(async () => {
    // NOTE: Do NOT call startSpeechRecognition() here.
    // startRecordingWithMediaRecorder() already calls it internally,
    // so calling it here too would create duplicate SpeechRecognition instances.
    try {
      shouldKeepRecognizingRef.current = true;
      try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
      if (typeof MediaRecorder !== 'undefined') {
        await startRecordingWithMediaRecorder();
      } else if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        startRecordingFallback();
      } else {
        onEventRef.current?.('error', {
          message: 'Voice input is not supported in this browser. Please type your argument instead.',
        });
      }
    } catch (err) {
      console.error('[startRecording error]:', err);
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        startRecordingFallback();
      } else {
        onEventRef.current?.('error', {
          message: 'Microphone access failed. Please allow mic access or use text input.',
        });
      }
    }
  }, [startRecordingWithMediaRecorder, startRecordingFallback]);

  /** Send a typed text argument via the transcript_direct event */
  const sendText = useCallback((text) => {
    if (!text?.trim() || !socketRef.current) return;
    warmUpAudio(); // UNLOCK AUDIO HERE
    socketRef.current.emit('transcript_direct', { debateId, text: text.trim() });
  }, [debateId, warmUpAudio]);

  const stopRecording = useCallback(() => {
    /* Only emit audio_end if a recording was actually active */
    const wasRecording = isRecordingRef.current;
    isRecordingRef.current = false;
    shouldKeepRecognizingRef.current = false;

    const recorder = mediaRecRef.current;
    const finalTranscript = liveTranscriptRef.current?.trim();

    /* Release mic stream */
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    /* Stop speech recognition and send the final text directly */
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (socketRef.current?._submittingTurn) return; // Prevent double-submit
    socketRef.current._submittingTurn = true;

    // MediaRecorder emits its final blob asynchronously after stop().
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        socketRef.current?.emit('audio_end', {
          debateId,
          transcriptFallback: finalTranscript || '',
        });
      };
      recorder.stop();
      mediaRecRef.current = null;
      setLiveTranscript('');
      liveTranscriptRef.current = '';
      return;
    }

    /* SpeechRecognition-only fallback: wait briefly for the final transcript */
    setTimeout(() => {
      const delayedTranscript = liveTranscriptRef.current?.trim();

      if (delayedTranscript) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[useDebateSocket] Sending transcript_direct (length):', delayedTranscript.length);
        }
        sendText(delayedTranscript);
      } else if (wasRecording) {
        // Trigger server-side error handling for transcript_direct fallback.
        socketRef.current?.emit('transcript_direct', { debateId, text: '' });
      }
      setLiveTranscript('');
      liveTranscriptRef.current = '';
    }, 400);

  }, [debateId, sendText]);

  const endDebate = useCallback(() => {
    socketRef.current?.emit('end_debate', { debateId, tzOffsetMinutes: tzOffsetMinutesRef.current });
  }, [debateId]);

  /** Notify server of language change mid-debate */
  const setLanguage = useCallback((lang) => {
    preferredLangRef.current = lang;
    socketRef.current?.emit('set_language', { debateId, lang: lang || 'auto' });
  }, [debateId]);

  /** Allow callers to toggle voice output without forcing a socket reconnect. */
  const setVoiceEnabled = useCallback((enabled) => {
    voiceEnabledRef.current = !!enabled;
  }, []);

  /** Allow callers to override detected TTS language (iso639-1 code or 'auto'). */
  const setTtsLanguageOverride = useCallback((langOrAuto) => {
    ttsLanguageOverrideRef.current = langOrAuto === 'auto' ? 'auto' : (langOrAuto || 'en');
  }, []);

  /* ─────────────────────────────────────────────
     Cleanup on unmount
  ───────────────────────────────────────────── */
  useEffect(() => {
    return () => {
      mediaRecRef.current?.state !== 'inactive' && mediaRecRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      recognitionRef.current?.stop();
      audioCtxRef.current?.close();
      audioQueueRef.current = [];
    };
  }, []);

  return {
    connected,
    startRecording,
    stopRecording,
    endDebate,
    sendText,
    setLanguage,
    setVoiceEnabled,
    setTtsLanguageOverride,
    liveTranscript,
    isAISpeaking,
    audioSupported,
    availableVoices,
  };
}

/** Utility to convert base64 to Blob */
function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
  const byteCharacters = atob(b64Data);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    byteArrays.push(byteArray);
  }
  return new Blob(byteArrays, { type: contentType });
}

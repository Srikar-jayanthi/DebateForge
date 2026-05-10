const axios = require('axios');

/* ── Local Ollama Config (Addition 4) ── */
const OLLAMA_URL    = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL  = process.env.OLLAMA_MODEL || 'llama3';

/* ── Wait helper ── */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── ISO 639-1 language code → human-readable name ── */
const LANGUAGE_NAMES = {
  en: 'English', hi: 'Hindi', ta: 'Tamil', te: 'Telugu', kn: 'Kannada', ml: 'Malayalam',
  mr: 'Marathi', bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', ur: 'Urdu',
  fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', it: 'Italian',
  nl: 'Dutch', ru: 'Russian', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  ar: 'Arabic', tr: 'Turkish', pl: 'Polish', sv: 'Swedish', da: 'Danish',
  fi: 'Finnish', no: 'Norwegian', el: 'Greek', th: 'Thai', vi: 'Vietnamese',
  id: 'Indonesian', ms: 'Malay', ro: 'Romanian', uk: 'Ukrainian', cs: 'Czech',
  hu: 'Hungarian', he: 'Hebrew', sw: 'Swahili',
};

function formatFallacyProfile(profile) {
  if (!profile || Object.keys(profile).length === 0) return 'No history yet';
  return Object.entries(profile)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type, count]) => `${type}: ${count} times`)
    .join(', ');
}

function formatWeaknessList(items, limit = 8) {
  if (!Array.isArray(items) || items.length === 0) return 'None yet';
  return items
    .filter(Boolean)
    .slice(-limit)
    .join('; ');
}

function buildSystemPrompt(session) {
  const personaStyles = {
    balanced:   'Argue in a balanced, measured style. Be firm but fair.',
    socratic:   "Use the Socratic method: respond mostly with probing questions that expose contradictions in the user's reasoning.",
    aggressive: 'Be rhetorically aggressive and assertive. Use sharp wit, pointed challenges, and rapid-fire rebuttals.',
    academic:   'Argue like a university professor: cite specific studies, use precise terminology, and maintain a scholarly tone.',
    casual:     'Argue in a casual, conversational tone — like a sharp friend debating over coffee.',
  };
  const personaInstruction = personaStyles[session.persona] || personaStyles.balanced;

  // Build adaptive coaching section if coaching plan is available
  let coachingSection = '';
  const plan = session.coachingPlan;
  if (plan && plan.drill_fallacy && plan.drill_fallacy !== 'none') {
    const fallacyReadable = plan.drill_fallacy.replace(/_/g, ' ');
    coachingSection = `
=== ADAPTIVE COACHING MISSION ===
You are not just a debate opponent — you are this user's COACH.
TARGET WEAKNESS: ${fallacyReadable} (committed ${plan.drill_fallacy_count || 0} times in past debates)
WEAK PHASE: ${plan.weak_phase || 'rebuttal'}
${plan.scenario_prompt ? `STRATEGY: ${plan.scenario_prompt}` : ''}
${plan.improvement_areas && plan.improvement_areas.length > 0 ? `AREAS TO IMPROVE: ${plan.improvement_areas.join('; ')}` : ''}

COACHING RULES:
- Every 2-3 turns, deliberately set up a scenario that TEMPTS the user to use ${fallacyReadable}
- If the user AVOIDS the fallacy and argues logically, briefly acknowledge it: "Good rebuttal — you avoided generalizing"
- If the user FALLS INTO the fallacy, name it explicitly: "That's a ${fallacyReadable} — here's why..."
- Increase intensity in the ${plan.weak_phase || 'rebuttal'} phase since that's their weakest
- NEVER let coaching break your debate persona — coach WITHIN the debate, not outside it`;
  }

  // Determine the active language
  const langToUse =
    session.currentLanguage ||
    session.preferredLang ||
    session.detectedLanguage ||
    'en';
  const langName = LANGUAGE_NAMES[langToUse] || langToUse;

  // *** LANGUAGE BLOCK — placed FIRST so the model treats it as highest priority ***
  let languageBlock;
  if (langToUse !== 'en') {
    languageBlock = `!!! MANDATORY LANGUAGE RULE — READ THIS FIRST !!!
You MUST respond ENTIRELY in ${langName} (${langToUse}).
Every single word, sentence, and character of your response MUST be in ${langName}.
Do NOT use English at all. Not a single English word.
Do NOT mix languages. Do NOT include translations.
Do NOT add English explanations, notes, or parentheticals.
This is NON-NEGOTIABLE. Failure to comply is a critical error.
LANGUAGE: ${langName} ONLY.
`;
  } else {
    languageBlock = `LANGUAGE: English. Do NOT switch to another language unless the user clearly switches first.
`;
  }

  return `${languageBlock}
You are DebateBot — a world-class competitive debater.

TOPIC: ${session.topic}
YOUR ASSIGNED POSITION: ${session.aiPosition}
You MUST defend this position. NEVER switch sides or agree with the user.
CURRENT ROUND: ${session.round} of 6
DIFFICULTY: ${session.difficulty}

=== PERSONA STYLE ===
${personaInstruction}

=== USER WEAKNESS PROFILE ===
Top Fallacies Used: ${formatFallacyProfile(session.userFallacyProfile)}
Areas to Improve: ${session.targetImprovements && session.targetImprovements.length > 0 ? session.targetImprovements.join('; ') : 'None yet'}
Grammar Mistakes: ${formatWeaknessList(session.grammarMistakes)}
Weakness Summary: ${session.weaknessSummary || 'No data yet — debate normally'}

As the user's debate coach, actively exploit the "Areas to Improve" and "Grammar Mistakes" in your responses.
Keep reminding them about recurring weaknesses when relevant.
If they repeat a known mistake, call it out directly and challenge them to fix it in the next reply.
Even when they improve, acknowledge it briefly and immediately push them to sustain that improvement.
${coachingSection}
${session._phasePromptAddition ? `\n=== CURRENT PHASE ===\n${session._phasePromptAddition}\n` : ''}
=== STRICT RULES ===
1. NEVER agree with the user. Never concede your position.
2. Maximum 4 sentences per response (this is spoken word)
3. Use ONE specific statistic or study in every response
4. End EVERY response with either a question OR a direct challenge to the user
5. From round 3 onwards, exploit the user's documented fallacy weaknesses
6. Escalate rhetorical intensity each round
7. CRITICAL: Each response MUST be DIFFERENT from all your previous responses. Never start with the same phrase twice.${langToUse !== 'en' ? `\n8. REMINDER: Your ENTIRE response MUST be in ${langName}. Zero English words allowed.` : ''}

=== DIFFICULTY BEHAVIOR ===
beginner:       Simple vocabulary, gentle challenges
intermediate:   Statistics and research, moderate pressure
expert:         Advanced rhetoric, name the user's fallacies, high pressure
devils_advocate: Take the most extreme defensible version of your position

=== FORMAT ===
Respond ONLY with your spoken debate argument (max 4 sentences).
No labels, stage directions, or meta-commentary.`;
}

/* ─── Ollama streaming (local LLM) ─── */
async function* streamOllama(session, userArgument) {
  const history = (session.conversationHistory || []).slice(-6);

  try {
    // Build a summary of what we've already said to prevent repetition
    const previousAiReplies = history
      .filter(m => m.role === 'assistant')
      .map(m => m.content)
      .slice(-3);

    const systemPrompt = buildSystemPrompt(session) +
      (previousAiReplies.length > 0
        ? `\n\n=== YOUR PREVIOUS RESPONSES (DO NOT REPEAT THESE) ===\n${previousAiReplies.map((r, i) => `Round ${i + 1}: ${r.slice(0, 100)}...`).join('\n')}`
        : '');

    const response = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: userArgument },
        ],
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 160,
          top_p: 0.92,
          repeat_penalty: 1.25,
          seed: Math.floor(Math.random() * 2147483647), // random seed = unique response each call
        },
      },
      {
        responseType: 'stream',
        timeout: 60000,
      }
    );

    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
          if (parsed.done) return;
        } catch {
          // Skip malformed JSON chunks
        }
      }
    }
  } catch (e) {
    const isConnRefused = e.code === 'ECONNREFUSED' || e.message?.includes('ECONNREFUSED');
    // eslint-disable-next-line no-console
    console.error(`[OLLAMA] ${isConnRefused ? 'Connection refused — is Ollama running?' : 'Error:'} ${e.message}`);
    if (isConnRefused) {
      // Don't yield fallback text — let the caller know the service is down
      throw new Error('AI_SERVICE_OFFLINE');
    }
    yield "That's an interesting point, but I must strongly disagree. " +
          "Your argument lacks the empirical foundation needed to be convincing. " +
          "Can you provide specific evidence to support that claim?";
  }
}
/* ─── Groq streaming (High Speed Cloud LLM) ─── */
async function* streamGroq(session, userArgument) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY_MISSING');

  const history = (session.conversationHistory || []).slice(-8);
  const systemPrompt = buildSystemPrompt(session);

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          { role: 'user', content: userArgument },
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 512,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        responseType: 'stream',
      }
    );

    for await (const chunk of response.data) {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed === 'data: [DONE]') return;
        if (trimmed.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(trimmed.replace('data: ', ''));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) yield content;
          } catch (e) {
            // skip malformed
          }
        }
      }
    }
  } catch (e) {
    console.error('[GROQ] Error:', e.message);
    if (e.response?.status === 429) {
      throw new Error('AI_QUOTA_EXCEEDED');
    }
    throw e;
  }
}

/* ─── Gemini streaming (Cloud LLM) ─── */
async function* streamGemini(session, userArgument) {
  const model = getGeminiModel();
  if (!model) throw new Error('GEMINI_API_KEY_MISSING');

  const history = (session.conversationHistory || []).slice(-8);
  const systemPrompt = buildSystemPrompt(session);

  try {
    const chat = model.startChat({
      history: history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    });

    const result = await chat.sendMessageStream([{ text: userArgument }, { text: `\n\n${systemPrompt}\n\nREPLY IN THE SPECIFIED LANGUAGE ONLY.` }]);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  } catch (e) {
    console.error('[GEMINI] Stream error:', e.message);
    if (e.message?.includes('429') || e.message?.includes('quota')) {
      throw new Error('AI_QUOTA_EXCEEDED');
    }
    throw e;
  }
}

/* ─── Public: stream response via Ollama, Groq (primary), or Gemini (fallback) ─── */
async function* streamDebateResponse(session, userArgument) {
  const useLocal = process.env.USE_LOCAL_LLM === 'true';

  try {
    if (useLocal) {
      yield* streamOllama(session, userArgument);
    } else if (process.env.GROQ_API_KEY) {
      // Use Groq as primary cloud LLM for high speed and better quota
      yield* streamGroq(session, userArgument);
    } else {
      yield* streamGemini(session, userArgument);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[LLM] AI failed:`, err?.message);
    
    if (err.message === 'AI_QUOTA_EXCEEDED') {
      throw new Error('AI limit reached. Please wait a minute before continuing the debate.');
    }
    
    if (useLocal) {
      if (err.message === 'AI_SERVICE_OFFLINE') {
        throw new Error('AI service is offline. Please start Ollama (`ollama serve`) and try again.');
      }
      throw new Error('Local AI failed to respond. Ensure Ollama is running and the llama3 model is installed (`ollama run llama3`).');
    }
    
    throw new Error('Cloud AI failed to respond. Please check your internet connection and API key.');
  }
}

function trimHistory(history, maxTurns = 10) {
  return (history || []).slice(-maxTurns);
}

/* ═══════════════════════════════════════════════════════════════
   Gemini Translation — translates Ollama's English debate output
   into the user's selected language.
   ═══════════════════════════════════════════════════════════════ */
let _geminiModel = null;

function getGeminiModel() {
  if (_geminiModel) return _geminiModel;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    _geminiModel = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    return _geminiModel;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[GEMINI] Failed to initialize:', e.message);
    return null;
  }
}

/**
 * Translate text to a target language using Gemini (primary) or Ollama (fallback).
 * Returns the translated text, or the original if all translation methods fail.
 *
 * @param {string} text      — English text to translate
 * @param {string} langCode  — ISO 639-1 code (e.g. 'te', 'hi', 'ta')
 * @returns {Promise<string>}
 */
async function translateText(text, langCode) {
  if (!text || !langCode || langCode === 'en') return text;

  const langName = LANGUAGE_NAMES[langCode] || langCode;

  const translationPrompt = `You are a professional translator.
Translate the following text into ${langName}.

CRITICAL RULES:
1. Output ONLY the translated text.
2. Do NOT include any English words or sentences.
3. Do NOT add any preamble, notes, or "Here is the translation".
4. If you see English technical terms, translate them to ${langName} or provide the phonetic equivalent in ${langName} script.
5. Translate the ENTIRE text. Do NOT cut it short.

TEXT TO TRANSLATE:
${text}`;

  /* ── Attempt 1: Gemini API ── */
  const model = getGeminiModel();
  if (model) {
    try {
      const result = await Promise.race([
        model.generateContent(translationPrompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Gemini translation timed out')), 120000)),
      ]);

      const translated = result.response?.text?.() || result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (translated && translated.trim().length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[GEMINI] Translated ${text.length} chars → ${langName} (${translated.trim().length} chars)`);
        return translated.trim();
      }
    } catch (e) {
      const is429 = e.message?.includes('429') || e.message?.includes('quota');
      // eslint-disable-next-line no-console
      console.warn(`[GEMINI] Translation failed${is429 ? ' (quota exceeded)' : ''}: ${e.message?.slice(0, 120)}`);
      // Fall through to Ollama
    }
  }

  /* ── Attempt 2: Ollama local translation ── */
  try {
    // eslint-disable-next-line no-console
    console.log(`[OLLAMA] Attempting translation to ${langName}...`);
    const response = await axios.post(
      `${OLLAMA_URL}/api/chat`,
      {
        model: OLLAMA_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are a translator. You ONLY output translated text. No explanations.`,
          },
          {
            role: 'user',
            content: translationPrompt,
          },
        ],
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      },
      { timeout: 120000 }
    );

    const ollamaTranslated = response.data?.message?.content;
    if (ollamaTranslated && ollamaTranslated.trim().length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[OLLAMA] Translated ${text.length} chars → ${langName} (${ollamaTranslated.trim().length} chars)`);
      return ollamaTranslated.trim();
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[OLLAMA] Translation also failed:`, e.message?.slice(0, 120));
  }

  // All translation methods failed — return original English
  return text;
}

module.exports = {
  streamDebateResponse,
  buildSystemPrompt,
  trimHistory,
  translateText,
  LANGUAGE_NAMES,
};

const { io } = require('socket.io-client');
const axios = require('axios');

const API_URL = 'http://localhost:5001';
const WS_URL = 'http://localhost:5001';

async function test() {
    console.log('Logging in...');
    try {
        const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
            email: 'testuser1@example.com',
            password: 'Password123!'
        });
        const token = loginRes.data.token;
        console.log('Logged in. Token received.');

        console.log('Fetching topics...');
        const topicsRes = await axios.get(`${API_URL}/api/topics`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const topic = topicsRes.data.topics[0];
        console.log('Using topic:', topic.title);

        console.log('Creating debate...');
        const debateRes = await axios.post(`${API_URL}/api/debates/start`, {
            topicId: topic._id,
            userSide: 'for',
            difficulty: 'beginner',
            format: 'freeform'
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const debateId = debateRes.data.debateId;
        console.log('Debate created. ID:', debateId);

        console.log('Connecting to WebSocket...');
        const socket = io(WS_URL, {
            auth: { token }
        });

        socket.on('connect', () => {
            console.log('WebSocket connected.');
            socket.emit('join_debate', { debateId });
        });

        socket.on('debate_joined', (data) => {
            console.log('Debate joined:', data);
            console.log('Sending transcript_direct...');
            socket.emit('transcript_direct', {
                debateId,
                text: 'Artificial Intelligence in schools can personalize learning for every student, addressing their unique strengths and weaknesses.'
            });
        });

        socket.on('scores_update', (data) => {
            console.log('SCORES_UPDATE received:', JSON.stringify(data, null, 2));
        });

        socket.on('fallacy_detected', (data) => {
            console.log('FALLACY_DETECTED received:', JSON.stringify(data, null, 2));
        });

        socket.on('ai_text_chunk', (data) => {
            process.stdout.write(data.text || '');
        });

        socket.on('ai_turn_complete', (data) => {
            console.log('\nAI turn complete.');
            console.log('Ending debate...');
            socket.emit('end_debate', { debateId });
        });

        socket.on('judge_verdict', (data) => {
            console.log('JUDGE_VERDICT received:', JSON.stringify(data, null, 2));
            socket.disconnect();
            process.exit(0);
        });

        socket.on('error', (err) => {
            console.error('Socket error:', err);
        });

    } catch (err) {
        console.error('Error during test:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
        process.exit(1);
    }
}

test();

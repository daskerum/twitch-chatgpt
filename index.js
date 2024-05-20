import express from 'express';
import axios from 'axios';
import qs from 'qs';
import bodyParser from 'body-parser';
import tmi from 'tmi.js';
import dotenv from 'dotenv';
import OpenAIOperations from './openai_operations.js';
import Log from './models/Log.js';
import Settings from './models/Settings.js';
import expressWs from 'express-ws';

dotenv.config();

const app = express();
expressWs(app);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.set('view engine', 'ejs');
app.use('/public', express.static('public'));

// Bot Configuration
const config = {
    GPT_MODE: process.env.GPT_MODE || "CHAT",
    HISTORY_LENGTH: parseInt(process.env.HISTORY_LENGTH || "10"),
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    MODEL_NAME: process.env.MODEL_NAME || "gpt-3.5-turbo",
    TWITCH_USER: process.env.TWITCH_USER || "oSetinhasBot",
    BOT_NAME: process.env.BOT_NAME || "CaptainBot",
    TWITCH_CLIENT_ID: process.env.TWITCH_CLIENT_ID,
    TWITCH_CLIENT_SECRET: process.env.TWITCH_CLIENT_SECRET,
    TWITCH_AUTH: process.env.TWITCH_AUTH || "oauth:your-oauth-token",
    COMMAND_NAME: (process.env.COMMAND_NAME || "!gpt").split(",").map(x => x.trim().toLowerCase()),
    CHANNELS: (process.env.CHANNELS || "oSetinhas,jones88").split(",").map(x => x.trim()),
    SEND_USERNAME: process.env.SEND_USERNAME !== "false",
    ENABLE_TTS: process.env.ENABLE_TTS === "true",
    ENABLE_CHANNEL_POINTS: process.env.ENABLE_CHANNEL_POINTS === "true",
    RANDOM_CHANCE: parseInt(process.env.RANDOM_CHANCE || "20"),
    LINK: process.env.LINK || "http://default-link.com",
    TIMED_MESSAGE_TIME: parseInt(process.env.TIMED_MESSAGE_TIME || "15"),
    COMMAND_CHANCE: parseInt(process.env.COMMAND_CHANCE || "100"),
    BOT_PROMPT: process.env.BOT_PROMPT || "Act as an advertising assistant.",
    COOLDOWN: parseInt(process.env.COOLDOWN || "10000"),
    REDIRECT_URI: process.env.REDIRECT_URI || "https://srv-copts7tjm4es73abmg90.onrender.com/auth/twitch/callback"
};

let botActive = true;
let streamerAccessToken = '';

// OpenAI operations
let openai_ops = new OpenAIOperations(
    config.OPENAI_API_KEY,
    config.MODEL_NAME,
    config.HISTORY_LENGTH,
    config.RANDOM_CHANCE,
    config.TWITCH_USER,
    config.BOT_NAME,
    config.LINK,
    config.COMMAND_CHANCE,
    config.BOT_PROMPT,
    config.COOLDOWN
);

// TMI.js Twitch Bot setup
const twitchClient = new tmi.Client({
    options: { debug: true },
    identity: {
        username: config.TWITCH_USER,
        password: config.TWITCH_AUTH
    },
    channels: config.CHANNELS
});

twitchClient.connect().catch(console.error);

twitchClient.on('message', async (channel, userstate, message, self) => {
    if (!botActive) return;
    if (self || userstate.username === config.TWITCH_USER) return;

    // Random interaction
    if (!message.startsWith('!') && !message.startsWith('/')) {
        const randomResponse = await openai_ops.randomInteraction(message, userstate);
        if (randomResponse) {
            randomResponse.match(new RegExp(`.{1,399}`, "g")).forEach((msg, index) => {
                setTimeout(() => twitchClient.say(channel, msg), 1000 * index);
            });
            return;
        }
    }

    // Command handling
    for (const cmd of config.COMMAND_NAME) {
        if (message.toLowerCase().startsWith(cmd)) {
            let text = message.slice(cmd.length).trim();
            if (config.SEND_USERNAME) text = `Message from user ${userstate.username}: ${text}`;

            const response = await openai_ops.executeCommand(cmd, text, userstate);
            if (response) {
                response.match(new RegExp(`.{1,399}`, "g")).forEach((msg, index) => {
                    setTimeout(() => twitchClient.say(channel, msg), 1000 * index);
                });
            }
            return;
        }
    }
});

// Endpoint to handle OAuth redirect
app.get('/auth/twitch/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).send('Code is missing');
    }

    try {
        const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', qs.stringify({
            client_id: config.TWITCH_CLIENT_ID,
            client_secret: config.TWITCH_CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: config.REDIRECT_URI
        }));

        streamerAccessToken = tokenResponse.data.access_token;
        res.send('Authorization successful, you can close this tab.');
    } catch (error) {
        console.error('Error getting access token:', error);
        res.status(500).send('Failed to get access token');
    }
});

// Express routes for updating variables and toggling bot status
app.post('/update-vars', async (req, res) => {
    const { gptMode, historyLength, openaiApiKey, modelName, twitchUser, botName, commandName, channels, sendUsername, enableTts, enableChannelPoints, randomChance, link, timedMessageTime, commandChance, botPrompt, cooldown } = req.body;

    const updatedConfig = {
        GPT_MODE: gptMode || config.GPT_MODE,
        HISTORY_LENGTH: parseInt(historyLength) || config.HISTORY_LENGTH,
        OPENAI_API_KEY: openaiApiKey || config.OPENAI_API_KEY,
        MODEL_NAME: modelName || config.MODEL_NAME,
        TWITCH_USER: twitchUser || config.TWITCH_USER,
        BOT_NAME: botName || config.BOT_NAME,
        COMMAND_NAME: (commandName || config.COMMAND_NAME).split(",").map(x => x.trim().toLowerCase()),
        CHANNELS: (channels || config.CHANNELS).split(",").map(x => x.trim()),
        SEND_USERNAME: sendUsername !== undefined ? sendUsername === "true" : config.SEND_USERNAME,
        ENABLE_TTS: enableTts !== undefined ? enableTts === "true" : config.ENABLE_TTS,
        ENABLE_CHANNEL_POINTS: enableChannelPoints !== undefined ? enableChannelPoints === "true" : config.ENABLE_CHANNEL_POINTS,
        RANDOM_CHANCE: parseInt(randomChance) || config.RANDOM_CHANCE,
        LINK: link || config.LINK,
        TIMED_MESSAGE_TIME: parseInt(timedMessageTime) || config.TIMED_MESSAGE_TIME,
        COMMAND_CHANCE: parseInt(commandChance) || config.COMMAND_CHANCE,
        BOT_PROMPT: botPrompt || config.BOT_PROMPT,
        COOLDOWN: parseInt(cooldown) || config.COOLDOWN
    };

    Object.assign(config, updatedConfig);

    await Settings.deleteMany({});
    for (const [key, value] of Object.entries(updatedConfig)) {
        await Settings.create({ key, value: value.toString() });
    }

    openai_ops = new OpenAIOperations(
        config.OPENAI_API_KEY,
        config.MODEL_NAME,
        config.HISTORY_LENGTH,
        config.RANDOM_CHANCE,
        config.TWITCH_USER,
        config.BOT_NAME,
        config.LINK,
        config.COMMAND_CHANCE,
        config.BOT_PROMPT,
        config.COOLDOWN
    );

    res.status(200).send("Variables updated successfully");
});

// Toggle bot status
app.post('/toggle-bot', (req, res) => {
    botActive = !botActive;
    res.status(200).send(`Bot is now ${botActive ? 'active' : 'inactive'}`);
});

// Serve the control panel
app.all('/', async (req, res) => {
    const logs = await Log.find({}).sort({ timestamp: -1 }).limit(100);
    res.render('index', { config, logs, botActive });
});

// Start the server
const server = app.listen(3000, () => console.log('Server running on port 3000'));

// WebSocket for updates
const wss = expressWs(app);
app.ws('/check-for-updates', (ws, req) => {
    ws.on('message', message => console.log("WebSocket message received:", message));
});

function notifyFileChange(url) {
    wss.clients.forEach(client => {
        if (client.readyState === ws.OPEN) client.send(JSON.stringify({ updated: true, url }));
    });
}

// Log saving function
function logMessage(level, message) {
    const log = new Log({ level, message });
    log.save().catch(err => console.log('Error saving log:', err));
}

// Example log entry
logMessage('info', 'Bot started successfully');

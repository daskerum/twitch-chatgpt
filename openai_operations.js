import OpenAI from "openai";

class OpenAIOperations {
    constructor(BOT_PROMPT, openai_key, model_name, history_length, RANDOM_INT, twitchUser) {
        this.messages = [{ role: "system", content: BOT_PROMPT }];
        this.api_key = openai_key;
        this.model_name = model_name;
        this.history_length = history_length;
        this.RANDOM_INT = RANDOM_INT;
        this.twitchUser = twitchUser;
        this.lastCalled = Date.now();
        this.cooldownPeriod = 10000; // 10 seconds
        this.openai = new OpenAI({ apiKey: openai_key });
    }

    check_history_length() {
        console.log(`Conversations in History: ${((this.messages.length / 2) - 1)}/${this.history_length}`);
        if (this.messages.length > ((this.history_length * 2) + 1)) {
            console.log('Message amount in history exceeded. Removing oldest user and assistant messages.');
            this.messages.splice(1, 2);
        }
    }

    async randomInteraction(text, user) {
        const randomChance = Math.floor(Math.random() * 100);
        if (randomChance < this.RANDOM_INT && !text.startsWith("!") && !text.startsWith("/") && user.username !== this.twitchUser) {
            const prompt = `${this.messages[0].content}\nUser: ${text}\nAssistant:`;
            return await this.make_openai_call(prompt, text);
        } else {
            console.log("No random interaction or bot is trying to reply to itself.");
            return null;
        }
    }

    async make_openai_call(text, originalText) {
        const currentTime = Date.now();
        if (currentTime - this.lastCalled < this.cooldownPeriod) {
            console.log("Cooldown in effect. Try again later.");
            return null;  // Prevent output during cooldown
        }
        this.lastCalled = currentTime;

        try {
            // Detect language from the original text
            const langResponse = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{role: "system", content: `Identify the language of the following text: ${originalText}`}],
                max_tokens: 10
            });

            const detectedLanguage = langResponse.choices[0].message.content.trim();

            // Use persona and language in the conversation context
            const conversationContext = `${this.messages[0].content} Respond in ${detectedLanguage}.\nRecent Conversation:\n${this.getRecentMessages()}`;
            this.messages.push({ role: "user", content: text });
            this.check_history_length();

            const response = await this.openai.chat.completions.create({
                model: this.model_name,
                messages: this.messages,
                temperature: 0.9,
                max_tokens: 150,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0.6,
                stop: ["\n", " User:", " Assistant:"]
            });

            if (response.choices && response.choices.length > 0) {
                let agent_response = response.choices[0].message.content;
                this.messages.push({ role: "assistant", content: agent_response });
                console.log(`Agent Response: ${agent_response}`);
                return agent_response;
            } else {
                throw new Error("No choices returned from OpenAI");
            }
        } catch (error) {
            console.error("Error in make_openai_call:", error);
            return "Sorry, something went wrong. Please try again later.";
        }
    }

    async createTimedMessage(text) {
        return await this.make_openai_call(text, text);
    }

    getRecentMessages() {
        // This function returns the last few messages to give context to the AI
        return this.messages.slice(-7).map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    async make_openai_call_completion(text) {
        try {
            const formattedText = `${this.messages[0].content}\nUser: ${text}\nAssistant:`;
            this.messages.push({ role: "user", content: formattedText });
            this.check_history_length();

            const response = await this.openai.chat.completions.create({
                model: this.model_name,
                messages: [{role: "system", content: this.messages[0].content}, {role: "user", content: text}],
                temperature: 1,
                max_tokens: 256,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            if (response.choices) {
                let agent_response = response.choices[0].message.content;
                console.log(`Agent Response: ${agent_response}`);
                this.messages.push({ role: "assistant", content: agent_response });
                return agent_response;
            } else {
                throw an Error("No choices returned from OpenAI");
            }
        } catch (error) {
            console.error("Error in make_openai_call_completion:", error);
            return "Sorry, something went wrong. Please try again later.";
        }
    }
}

export default OpenAIOperations;

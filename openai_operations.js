// openai_operations.js
import OpenAI from "openai";

export class OpenAIOperations {
    constructor(BOT_PROMPT, openai_key, model_name, history_length, RANDOM_INT) {
        this.messages = [{role: "system", content: BOT_PROMPT}];
        this.openai = new OpenAI({ apiKey: openai_key });
        this.model_name = model_name;
        this.history_length = history_length;
        this.RANDOM_INT = RANDOM_INT;
        this.lastCalled = Date.now();
        this.cooldownPeriod = 10000; // 10 seconds
    }

    check_history_length() {
        console.log(`Conversations in History: ${((this.messages.length / 2) -1)}/${this.history_length}`);
        if (this.messages.length > ((this.history_length * 2) + 1)) {
            console.log('Message amount in history exceeded. Removing oldest user and assistant messages.');
            this.messages.splice(1, 2);
        }
    }

    randomInteraction() {
        const randomChance = Math.floor(Math.random() * 100);
        if (randomChance < this.RANDOM_INT) {
            console.log("Random interaction triggered");
            return this.make_openai_call("Let's discuss something interesting!");
        } else {
            console.log("No random interaction.");
            return null;
        }
    }

    async make_openai_call(text) {
        const currentTime = Date.now();
        if (currentTime - this.lastCalled < this.cooldownPeriod) {
            console.log("Cooldown in effect. Try again later.");
            return "Please wait a moment before trying again.";
        }
        
        try {
            // Build the prompt with more context about the conversation
            const fullPrompt = `${this.messages[0].content}\nRecent Conversation:\n${this.getRecentMessages()}\nUser: ${text}\nAssistant:`;
            this.messages.push({role: "user", content: text});
            this.check_history_length();

            const response = await this.openai.chat.completions.create({
                model: this.model_name,
                messages: this.messages,
                temperature: 0.7,
                max_tokens: 100, // Reduced token usage
                top_p: 1,
                frequency_penalty: 0.5,
                presence_penalty: 0.6,
                prompt: fullPrompt,
            });

            this.lastCalled = currentTime; // Update last called time after a successful request

            if (response.choices && response.choices.length > 0) {
                let agent_response = response.choices[0].message.content;
                console.log(`Agent Response: ${agent_response}`);
                this.messages.push({role: "assistant", content: agent_response});
                return agent_response;
            } else {
                throw new Error("No choices returned from OpenAI");
            }
        } catch (error) {
            console.error("Error in make_openai_call:", error);
            return "Sorry, something went wrong. Please try again later.";
        }
    }

    getRecentMessages() {
        // This function returns the last few messages to give context to the AI
        return this.messages.slice(-5).map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    async make_openai_call_completion(text) {
        try {
            const formattedText = `${this.messages[0].content}\nUser: ${text}\nAssistant:`;
            this.messages.push({role: "user", content: formattedText});
            this.check_history_length();

            const response = await this.openai.completions.create({
                model: "text-davinci-003",
                prompt: formattedText,
                temperature: 1,
                max_tokens: 256,
                top_p: 1,
                frequency_penalty: 0,
                presence_penalty: 0,
            });

            if (response.choices) {
                let agent_response = response.choices[0].text;
                console.log(`Agent Response: ${agent_response}`);
                this.messages.push({role: "assistant", content: agent_response});
                return agent_response;
            } else {
                throw new Error("No choices returned from OpenAI");
            }
        } catch (error) {
            console.error(error);
            return "Sorry, something went wrong. Please try again later.";
        }
    }
}

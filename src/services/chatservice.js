import { askOpenRouter } from "../providers/openrouter.js";

export async function generateReply(userMessage) {
    return askOpenRouter([
        {
            role: "system",
            content: "Kamu adalah chatbot yang ramah, singkat, dan membantu."
        },
        {
            role: "user",
            content: userMessage
        }
    ])
}
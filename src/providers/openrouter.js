import { OpenRouter } from "@openrouter/sdk"
import {env} from "../config/env.js"

export async function askOpenRouter(messages) {

    const openrouter = new OpenRouter({
        apiKey: env.openRouterApiKey
    }) 

    const stream = await openrouter.chat.send({
        chatRequest: {
            model: env.model,
            messages: messages,
            stream: true
        }
    })

    let response = ""

    for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content
        if(content) {
            response += content
            process.stdout.write(content)
        }

        if (chunk.usage) {
            console.log("\nReasoning tokens:", chunk.usage.completionTokensDetails?.reasoningTokens);
        }
    }

    return response
}
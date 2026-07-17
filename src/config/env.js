import "dotenv/config"

var apiKey = process.env.OPENROUTER_API_KEY
var model = process.env.OPENROUTER_MODEL

console.log("Environment check:", {
    hasApiKey: Boolean(apiKey),
    hasModel: Boolean(model),
    model
});

if(!apiKey) {
    throw new Error("OPENROUTER_API_KEY not found in .env")
}

export const env = {
    openRouterApiKey: apiKey,
    model: model
}
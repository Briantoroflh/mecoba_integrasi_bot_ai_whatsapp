import "dotenv/config"

if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

var apiKey = process.env.OPENROUTER_API_KEY
var model = process.env.OPENROUTER_MODEL

if(!apiKey) {
    throw new Error("OPENROUTER_API_KEY not found in .env")
}

export const env = {
    openRouterApiKey: apiKey,
    model: model
}
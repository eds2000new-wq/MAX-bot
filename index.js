const express = require('express');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'MAX Bot is running',
        time: new Date().toISOString()
    });
});

app.get('/bot-link', (req, res) => {
    res.json({
        link: `https://platform-api.max.ru/write?bot=${process.env.MAX_BOT_TOKEN || 'not-set'}`,
        button_text: "📞 СВЯЗАТЬСЯ С АДМИНОМ"
    });
});

app.listen(port, () => {
    console.log(`✅ Server started on port ${port}`);
    console.log(`🔗 Bot link: https://platform-api.max.ru/write?bot=${process.env.MAX_BOT_TOKEN || 'not-set'}`);
});

const express = require('express');
const axios = require('axios');
require('dotenv').config();

// ==================== КОНФИГУРАЦИЯ ====================
const config = {
    botToken: process.env.MAX_BOT_TOKEN,
    adminGroupId: process.env.MAX_ADMIN_GROUP_ID, // ID группы админов
    apiUrl: 'https://platform-api.max.ru',
    port: process.env.PORT || 3000
};

// Проверка обязательных переменных
if (!config.botToken) {
    console.error('❌ Ошибка: MAX_BOT_TOKEN не указан в .env файле');
    process.exit(1);
}

if (!config.adminGroupId) {
    console.error('❌ Ошибка: MAX_ADMIN_GROUP_ID не указан в .env файле');
    process.exit(1);
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================
const app = express();
app.use(express.json());

// Хранилище для связи пользователей и сообщений
const userChats = new Map(); // userId -> { chatId, userName }
const adminReplies = new Map(); // adminMessageId -> userId

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Отправка сообщения в MAX
 */
async function sendMessage(chatId, text, attachments = []) {
    try {
        const payload = {
            text: text,
            attachments: attachments,
            notify: true,
            format: "html"
        };
        
        const response = await axios.post(
            `${config.apiUrl}/messages?chat_id=${chatId}`,
            payload,
            {
                headers: {
                    'Authorization': config.botToken,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        return response.data;
    } catch (error) {
        console.error('❌ Ошибка отправки:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Создание inline-клавиатуры
 */
function createButton(text, type, value) {
    if (type === 'link') {
        return {
            type: "link",
            text: text,
            url: value
        };
    } else {
        return {
            type: "callback",
            text: text,
            data: value
        };
    }
}

/**
 * Создание клавиатуры с кнопками
 */
function createKeyboard(buttons) {
    return [{
        type: "inline_keyboard",
        payload: {
            buttons: [buttons]
        }
    }];
}

// ==================== ВЕБХУК ДЛЯ ПОЛУЧЕНИЯ СОБЫТИЙ ====================

/**
 * Эндпоинт для получения обновлений от MAX
 * Сюда MAX будет присылать все события (нажатия кнопок, сообщения и т.д.)
 */
app.post('/webhook', async (req, res) => {
    try {
        const update = req.body;
        console.log('📩 Получен вебхук, тип:', update.type);
        
        // Обрабатываем разные типы обновлений
        if (update.type === 'bot_started') {
            // Пользователь запустил бота
            const userId = update.user?.id;
            const chatId = update.chat?.id;
            const userName = update.user?.name || 'Пользователь';
            
            if (userId && chatId) {
                console.log(`🤖 Бот запущен пользователем ${userName}`);
                userChats.set(userId, { chatId, userName });
                
                await sendMessage(chatId,
                    `👋 <b>Здравствуйте, ${userName}!</b>\n\n` +
                    `Это бот поддержки. Чтобы связаться с администратором, нажмите кнопку ниже.`,
                    createKeyboard([
                        createButton("📞 СВЯЗАТЬСЯ С АДМИНОМ", "callback", "contact_admin")
                    ])
                );
            }
        }
        else if (update.type === 'message_callback') {
            // Нажата callback-кнопка
            const userId = update.user?.id;
            const chatId = update.chat?.id;
            const callbackId = update.callback?.callback_id;
            const data = update.callback?.data;
            
            if (data === 'contact_admin') {
                // Пользователь нажал "Связаться с админом"
                console.log(`📞 Пользователь ${userId} запросил связь с админом`);
                
                // Отправляем уведомление админам
                const userName = update.user?.name || 'Пользователь';
                const userLink = update.user?.username ? `@${update.user.username}` : `ID: ${userId}`;
                
                const adminMessage = 
                    `📩 <b>Запрос на связь от пользователя</b>\n\n` +
                    `👤 <b>Имя:</b> ${userName}\n` +
                    `🔗 <b>Ссылка:</b> ${userLink}\n\n` +
                    `✏️ <i>Пользователь ожидает ответа</i>`;
                
                const sentMsg = await sendMessage(
                    config.adminGroupId,
                    adminMessage
                );
                
                if (sentMsg && sentMsg.message) {
                    // Сохраняем связь для будущих ответов
                    adminReplies.set(sentMsg.message.body.mid, userId);
                }
                
                // Подтверждение пользователю
                await sendMessage(chatId,
                    `✅ Ваш запрос отправлен администратору.\n` +
                    `Ожидайте ответа в этом чате.`
                );
                
                // Отвечаем на callback
                if (callbackId) {
                    await axios.post(
                        `${config.apiUrl}/answers?callback_id=${callbackId}`,
                        {},
                        { headers: { 'Authorization': config.botToken } }
                    );
                }
            }
        }
        else if (update.type === 'message_created') {
            // Пришло сообщение (от пользователя или от админа)
            const chatId = update.chat?.id;
            const userId = update.user?.id;
            const text = update.message?.body?.text;
            const messageId = update.message?.body?.mid;
            
            // Если это сообщение из группы админов и это ответ на другое сообщение
            if (chatId === config.adminGroupId && update.message?.reply_to) {
                // Это ответ админа пользователю
                const repliedToId = update.message.reply_to;
                const targetUserId = adminReplies.get(repliedToId);
                
                if (targetUserId) {
                    // Отправляем ответ пользователю
                    await sendMessage(targetUserId,
                        `📝 <b>Ответ администратора:</b>\n\n${text}`
                    );
                    console.log(`✅ Ответ отправлен пользователю ${targetUserId}`);
                }
            }
        }
        
        res.json({ success: true });
        
    } catch (error) {
        console.error('❌ Ошибка обработки вебхука:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==================== API ДЛЯ ПОЛУЧЕНИЯ ССЫЛКИ НА БОТА ====================

app.get('/bot-link', (req, res) => {
    res.json({
        link: `https://platform-api.max.ru/write?bot=${config.botToken}`,
        button_text: "📞 СВЯЗАТЬСЯ С АДМИНОМ"
    });
});

// ==================== ЗАПУСК ====================
app.listen(config.port, () => {
    console.log(`🌐 Веб-сервер запущен на порту ${config.port}`);
    console.log(`🤖 Бот готов к работе!`);
    console.log(`👥 Группа админов: ${config.adminGroupId}`);
    console.log(`🔗 Ссылка для кнопки: https://platform-api.max.ru/write?bot=${config.botToken}`);
});

process.on('SIGINT', () => process.exit());

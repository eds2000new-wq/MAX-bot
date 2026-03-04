const express = require('express');
const axios = require('axios');
require('dotenv').config();

// ==================== КОНФИГУРАЦИЯ ====================
const config = {
    botToken: process.env.MAX_BOT_TOKEN,
    channelId: process.env.MAX_CHANNEL_ID,
    adminGroupId: process.env.MAX_ADMIN_GROUP_ID, // Группа админов в MAX
    port: process.env.PORT || 3001,
    secretLink: process.env.MAX_SECRET_LINK || 'https://example.com/bonus',
    apiUrl: 'https://platform-api.max.ru'
};

// Проверка наличия токена
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

// Хранилище данных
const userChats = new Map(); // userId -> { waitingForMessage }
const adminReplies = new Map(); // adminMessageId -> userId
let lastUpdateId = 0;

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
        console.error('❌ Ошибка отправки сообщения:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Отправка сообщения в группу админов
 */
async function sendToAdminGroup(text, attachments = []) {
    return await sendMessage(config.adminGroupId, text, attachments);
}

/**
 * Ответ на callback от кнопки
 */
async function answerCallback(callbackId, notification = null, updatedMessage = null) {
    try {
        const payload = {};
        if (notification) payload.notification = notification;
        if (updatedMessage) payload.message = updatedMessage;
        
        const response = await axios.post(
            `${config.apiUrl}/answers?callback_id=${callbackId}`,
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
        console.error('❌ Ошибка ответа на callback:', error.response?.data || error.message);
        return null;
    }
}

/**
 * Получение обновлений через Long Polling
 */
async function getUpdates() {
    try {
        const response = await axios.get(
            `${config.apiUrl}/updates`,
            {
                headers: {
                    'Authorization': config.botToken,
                    'Content-Type': 'application/json'
                },
                params: {
                    last_event_id: lastUpdateId,
                    wait: 30
                }
            }
        );
        
        if (response.data && response.data.updates) {
            lastUpdateId = response.data.last_event_id || lastUpdateId;
            return response.data.updates;
        }
        return [];
    } catch (error) {
        console.error('❌ Ошибка получения обновлений:', error.response?.data || error.message);
        return [];
    }
}

// ==================== СОЗДАНИЕ КЛАВИАТУР ====================

/**
 * Основная клавиатура с кнопками
 */
function getMainKeyboard() {
    return [{
        type: "inline_keyboard",
        payload: {
            buttons: [
                [
                    {
                        type: "callback",
                        text: "✅ ПРОВЕРИТЬ ПОДПИСКУ",
                        payload: "check_sub"
                    },
                    {
                        type: "callback",
                        text: "📞 СВЯЗАТЬСЯ С АДМИНОМ",
                        payload: "contact_admin"
                    }
                ]
            ]
        }
    }];
}

/**
 * Клавиатура с кнопкой перехода в канал
 */
function getChannelKeyboard() {
    return [{
        type: "inline_keyboard",
        payload: {
            buttons: [
                [
                    {
                        type: "link",
                        text: "📢 ПЕРЕЙТИ В КАНАЛ",
                        url: `https://max.ru/chat/${config.channelId}`
                    }
                ],
                [
                    {
                        type: "callback",
                        text: "✅ ПРОВЕРИТЬ ПОДПИСКУ",
                        payload: "check_sub"
                    },
                    {
                        type: "callback",
                        text: "📞 СВЯЗАТЬСЯ С АДМИНОМ",
                        payload: "contact_admin"
                    }
                ]
            ]
        }
    }];
}

/**
 * Клавиатура с кнопкой отмены
 */
function getCancelKeyboard() {
    return [{
        type: "inline_keyboard",
        payload: {
            buttons: [[
                {
                    type: "callback",
                    text: "❌ ОТМЕНА",
                    payload: "cancel_message"
                }
            ]]
        }
    }];
}

// ==================== ПРОВЕРКА ПОДПИСКИ ====================

/**
 * Проверка, подписан ли пользователь на канал
 */
async function checkSubscription(userId) {
    try {
        // В MAX пока нет прямого API для проверки подписки
        // Это заглушка - в реальности нужно использовать другой подход
        // Например, хранить подписчиков в базе данных
        console.log(`🔍 Проверка подписки для пользователя ${userId}`);
        
        // Для демо возвращаем false
        return false;
    } catch (error) {
        console.error('❌ Ошибка проверки подписки:', error);
        return false;
    }
}

// ==================== ОБРАБОТКА ОБНОВЛЕНИЙ ====================

/**
 * Основной обработчик обновлений
 */
async function processUpdates() {
    const updates = await getUpdates();
    
    for (const update of updates) {
        // Новое сообщение
        if (update.type === 'message_created') {
            await handleMessage(update);
        }
        // Callback от кнопки
        else if (update.type === 'message_callback') {
            await handleCallback(update);
        }
        // Бот запущен
        else if (update.type === 'bot_started') {
            await handleBotStarted(update);
        }
    }
}

/**
 * Обработка нового сообщения
 */
async function handleMessage(update) {
    const message = update.message;
    const userId = message.sender.id;
    const chatId = message.recipient.chat_id;
    const text = message.body?.text || '';
    const userName = message.sender.name || 'Пользователь';
    
    console.log(`📩 Сообщение от ${userName} (${userId}): ${text}`);
    
    // Проверяем, ожидает ли бот сообщение от этого пользователя
    const userData = userChats.get(userId);
    
    if (userData && userData.waitingForMessage) {
        // Пользователь хочет отправить сообщение админу
        userData.waitingForMessage = false;
        userChats.set(userId, userData);
        
        // Создаём сообщение для админов
        const adminMessage = 
            `📩 <b>Новое сообщение от пользователя</b>\n\n` +
            `👤 <b>Имя:</b> ${userName}\n` +
            `🆔 <b>ID:</b> ${userId}\n\n` +
            `💬 <b>Сообщение:</b>\n${text}`;
        
        // Отправляем админам
        const sentMsg = await sendToAdminGroup(adminMessage);
        
        if (sentMsg && sentMsg.message) {
            // Сохраняем связь для ответа
            adminReplies.set(sentMsg.message.body.mid, { userId, userName });
        }
        
        // Подтверждение пользователю
        await sendMessage(chatId, '✅ Ваше сообщение отправлено администратору. Ожидайте ответа.');
    } else {
        // Обычное сообщение - предлагаем действия
        await sendMessage(chatId, 
            `👋 Здравствуйте, ${userName}!\n\n` +
            `Выберите действие:`,
            getMainKeyboard()
        );
    }
}

/**
 * Обработка callback от кнопок
 */
async function handleCallback(update) {
    const callback = update.callback;
    const userId = callback.user.id;
    const chatId = callback.message.recipient.chat_id;
    const userName = callback.user.name || 'Пользователь';
    const payload = callback.payload;
    
    console.log(`🔘 Callback от ${userName} (${userId}): ${payload}`);
    
    // Проверка подписки
    if (payload === 'check_sub') {
        const isSubscribed = await checkSubscription(userId);
        
        if (isSubscribed) {
            await answerCallback(
                callback.callback_id,
                null,
                {
                    text: `🎉 <b>Отлично, ${userName}!</b>\n\n` +
                          `Вы подписаны на канал.\n\n` +
                          `Ваш бонус: ${config.secretLink}`,
                    attachments: []
                }
            );
        } else {
            await answerCallback(
                callback.callback_id,
                null,
                {
                    text: `❌ <b>${userName}, вы не подписаны на канал</b>\n\n` +
                          `Чтобы получить бонус, подпишитесь на канал и нажмите кнопку снова.`,
                    attachments: getChannelKeyboard()
                }
            );
        }
    }
    
    // Связь с админом
    else if (payload === 'contact_admin') {
        // Устанавливаем флаг ожидания сообщения
        userChats.set(userId, { waitingForMessage: true });
        
        await answerCallback(
            callback.callback_id,
            null,
            {
                text: `📝 <b>Напишите ваш вопрос</b>\n\n` +
                      `Я передам его администратору.`,
                attachments: getCancelKeyboard()
            }
        );
    }
    
    // Отмена сообщения
    else if (payload === 'cancel_message') {
        const userData = userChats.get(userId);
        if (userData) {
            userData.waitingForMessage = false;
            userChats.set(userId, userData);
        }
        
        await answerCallback(
            callback.callback_id,
            null,
            {
                text: `❌ Отправка сообщения отменена.`,
                attachments: getMainKeyboard()
            }
        );
    }
}

/**
 * Обработка запуска бота
 */
async function handleBotStarted(update) {
    const userId = update.user.id;
    const chatId = update.chat.id;
    const userName = update.user.name || 'Пользователь';
    
    console.log(`🤖 Бот запущен пользователем ${userName} (${userId})`);
    
    // Сохраняем информацию о пользователе
    userChats.set(userId, { waitingForMessage: false });
    
    // Приветственное сообщение
    await sendMessage(chatId,
        `👋 <b>Здравствуйте, ${userName}!</b>\n\n` +
        `Это официальный бот канала. Здесь вы можете:\n` +
        `• ✅ Проверить подписку и получить бонус\n` +
        `• 📞 Связаться с администратором\n\n` +
        `👇 Выберите действие:`,
        getMainKeyboard()
    );
}

// ==================== ВЕБ-СЕРВЕР ====================

// Эндпоинт для отправки постов в канал (из AppScript)
app.post('/send-post', async (req, res) => {
    try {
        const { text, attachments } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        
        // Отправляем пост в канал с кнопкой связи с админом
        const adminButton = [{
            type: "inline_keyboard",
            payload: {
                buttons: [[
                    {
                        type: "link",
                        text: "📞 СВЯЗАТЬСЯ С АДМИНОМ",
                        url: `https://max.ru/write?bot=${config.botToken}`
                    }
                ]]
            }
        }];
        
        const result = await sendMessage(config.channelId, text, adminButton);
        
        if (result) {
            res.json({ success: true, message: 'Post sent to channel' });
        } else {
            res.status(500).json({ error: 'Failed to send post' });
        }
    } catch (error) {
        console.error('❌ API Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Эндпоинт для вебхуков (если нужен)
app.post('/webhook', async (req, res) => {
    const update = req.body;
    await handleMessage(update);
    res.json({ ok: true });
});

// Статус бота
app.get('/stats', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        activeUsers: userChats.size,
        pendingReplies: adminReplies.size,
        lastUpdateId
    });
});

// ==================== ЗАПУСК LONG POLLING ====================

// Запускаем polling
async function startPolling() {
    console.log('🔄 Запуск Long Polling...');
    while (true) {
        try {
            await processUpdates();
        } catch (error) {
            console.error('❌ Ошибка в polling:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

// Запуск сервера
app.listen(config.port, () => {
    console.log(`🌐 Веб-сервер запущен на порту ${config.port}`);
    console.log(`📢 MAX Bot готов к работе!`);
    console.log(`📢 Канал ID: ${config.channelId}`);
    console.log(`👥 Группа админов ID: ${config.adminGroupId}`);
    
    // Запускаем polling
    startPolling();
});

// ==================== ОБРАБОТКА ЗАВЕРШЕНИЯ ====================
process.on('SIGINT', () => {
    console.log('🛑 Получен сигнал завершения, останавливаем бота...');
    process.exit();
});

process.on('SIGTERM', () => {
    console.log('🛑 Получен сигнал завершения, останавливаем бота...');
    process.exit();
});

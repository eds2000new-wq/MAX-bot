const { MAXBot, Keyboard } = require('max-bot-sdk');
const express = require('express');
require('dotenv').config();

// ==================== КОНФИГУРАЦИЯ ====================
const config = {
    botToken: process.env.MAX_BOT_TOKEN,
    channelId: process.env.MAX_CHANNEL_ID,
    adminGroupId: process.env.MAX_ADMIN_GROUP_ID,
    port: process.env.PORT || 3000,
    secretLink: process.env.MAX_SECRET_LINK || 'https://example.com/bonus'
};

// ==================== ИНИЦИАЛИЗАЦИЯ БОТА ====================
const bot = new MAXBot(config.botToken);

// Хранилище данных
const userStates = new Map(); // userId -> { waitingForMessage }
const adminThreads = new Map(); // messageId -> userId

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================

// Запуск бота
bot.on('start', async (ctx) => {
    const userId = ctx.user.id;
    const chatId = ctx.chat.id;
    const userName = ctx.user.name || 'Пользователь';
    
    console.log(`🤖 Бот запущен пользователем ${userName} (${userId})`);
    
    // Клавиатура с двумя кнопками
    const keyboard = new Keyboard()
        .addRow()
        .addButton('✅ ПРОВЕРИТЬ ПОДПИСКУ', 'check_sub')
        .addButton('📞 СВЯЗАТЬСЯ С АДМИНОМ', 'contact_admin')
        .build();
    
    await ctx.reply(
        `👋 <b>Здравствуйте, ${userName}!</b>\n\n` +
        `Это официальный бот канала. Здесь вы можете:\n` +
        `• ✅ Проверить подписку и получить бонус\n` +
        `• 📞 Связаться с администратором\n\n` +
        `👇 Выберите действие:`,
        { parse_mode: 'HTML', keyboard: keyboard }
    );
});

// Обработка callback-кнопок
bot.on('callback', async (ctx) => {
    const userId = ctx.user.id;
    const chatId = ctx.chat.id;
    const userName = ctx.user.name || 'Пользователь';
    const data = ctx.data;
    
    if (data === 'check_sub') {
        // Здесь логика проверки подписки
        await ctx.answerCallback('🔄 Проверяю подписку...');
        
        // Для демо просто отвечаем
        const keyboard = new Keyboard()
            .addRow()
            .addButton('📢 ПЕРЕЙТИ В КАНАЛ', 'channel_link', true, `https://max.ru/chat/${config.channelId}`)
            .addRow()
            .addButton('✅ ПРОВЕРИТЬ СНОВА', 'check_sub')
            .addButton('📞 СВЯЗАТЬСЯ С АДМИНОМ', 'contact_admin')
            .build();
        
        await ctx.editMessage(
            `❌ <b>${userName}, вы не подписаны на канал</b>\n\n` +
            `Чтобы получить бонус, подпишитесь на канал и нажмите кнопку снова.`,
            { parse_mode: 'HTML', keyboard: keyboard }
        );
        
    } else if (data === 'contact_admin') {
        // Устанавливаем флаг ожидания сообщения
        userStates.set(userId, { waitingForMessage: true });
        
        const keyboard = new Keyboard()
            .addRow()
            .addButton('❌ ОТМЕНА', 'cancel_message')
            .build();
        
        await ctx.editMessage(
            `📝 <b>Напишите ваш вопрос</b>\n\n` +
            `Я передам его администратору.`,
            { parse_mode: 'HTML', keyboard: keyboard }
        );
        
    } else if (data === 'cancel_message') {
        userStates.delete(userId);
        
        const keyboard = new Keyboard()
            .addRow()
            .addButton('✅ ПРОВЕРИТЬ ПОДПИСКУ', 'check_sub')
            .addButton('📞 СВЯЗАТЬСЯ С АДМИНОМ', 'contact_admin')
            .build();
        
        await ctx.editMessage(
            `❌ Отправка сообщения отменена.`,
            { parse_mode: 'HTML', keyboard: keyboard }
        );
    }
});

// Обработка обычных сообщений
bot.on('message', async (ctx) => {
    const userId = ctx.user.id;
    const chatId = ctx.chat.id;
    const userName = ctx.user.name || 'Пользователь';
    const text = ctx.text;
    
    // Проверяем, ожидает ли бот сообщение
    const userState = userStates.get(userId);
    
    if (userState?.waitingForMessage) {
        // Пользователь хочет отправить сообщение админу
        userStates.delete(userId);
        
        // Пересылаем админам
        const adminKeyboard = new Keyboard()
            .addRow()
            .addButton('👤 Ответить пользователю', 'reply_user', false, userId)
            .build();
        
        await bot.sendMessage(
            config.adminGroupId,
            `📩 <b>Новое сообщение от пользователя</b>\n\n` +
            `👤 <b>Имя:</b> ${userName}\n` +
            `🆔 <b>ID:</b> ${userId}\n\n` +
            `💬 <b>Сообщение:</b>\n${text}`,
            { parse_mode: 'HTML', keyboard: adminKeyboard }
        );
        
        // Подтверждение пользователю
        const keyboard = new Keyboard()
            .addRow()
            .addButton('✅ ПРОВЕРИТЬ ПОДПИСКУ', 'check_sub')
            .addButton('📞 СВЯЗАТЬСЯ С АДМИНОМ', 'contact_admin')
            .build();
        
        await ctx.reply(
            '✅ Ваше сообщение отправлено администратору. Ожидайте ответа.',
            { keyboard: keyboard }
        );
        
    } else {
        // Обычное сообщение
        const keyboard = new Keyboard()
            .addRow()
            .addButton('✅ ПРОВЕРИТЬ ПОДПИСКУ', 'check_sub')
            .addButton('📞 СВЯЗАТЬСЯ С АДМИНОМ', 'contact_admin')
            .build();
        
        await ctx.reply(
            `❓ Чтобы связаться с администратором, нажмите кнопку "СВЯЗАТЬСЯ С АДМИНОМ".`,
            { keyboard: keyboard }
        );
    }
});

// ==================== API ДЛЯ ОТПРАВКИ ПОСТОВ ====================
const app = express();
app.use(express.json());

app.post('/send-post', async (req, res) => {
    try {
        const { text } = req.body;
        
        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }
        
        // Клавиатура для поста в канале
        const keyboard = new Keyboard()
            .addRow()
            .addButton('📞 СВЯЗАТЬСЯ С АДМИНОМ', 'contact_admin', true, `https://max.ru/write?bot=${config.botToken}`)
            .build();
        
        await bot.sendMessage(
            config.channelId,
            text,
            { keyboard: keyboard, parse_mode: 'HTML' }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('❌ Ошибка:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/stats', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        activeUsers: userStates.size
    });
});

app.listen(config.port, () => {
    console.log(`🌐 Веб-сервер запущен на порту ${config.port}`);
    console.log(`🤖 MAX Bot готов к работе!`);
    console.log(`📢 Канал ID: ${config.channelId}`);
    console.log(`👥 Группа админов ID: ${config.adminGroupId}`);
});

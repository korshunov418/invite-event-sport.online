const { Markup } = require('telegraf');

class Keyboards {
  static getMainMenu(language = 'ru') {
    const texts = {
      'ru': {
        'create_event': 'Создать событие',
        'info': 'Информация',
        'help': 'Помощь'
      },
      'en': {
        'create_event': 'Create Event',
        'info': 'Information',
        'help': 'Help'
      }
    };

    const t = texts[language] || texts['ru'];

    return Markup.keyboard([
      [t.create_event],
      [t.info, t.help]
    ]).resize();
  }

  static getEventKeyboard(eventId, language = 'ru', pollActive = true) {
    const buttonTexts = {
      'ru': {
        'join': '➕ Записаться',
        'leave': '➖ Отписаться',
        'list': '👥 Список',
        'teams': '🏈 Команды',
        'reset': '🔄 Сбросить',
        'delete': '🗑️ Удалить'
      },
      'en': {
        'join': '➕ Join',
        'leave': '➖ Leave',
        'list': '👥 List',
        'teams': '🏈 Teams',
        'reset': '🔄 Reset',
        'delete': '🗑️ Delete'
      }
    };
    
    const t = buttonTexts[language] || buttonTexts['ru'];
    
    const buttons = [];
    
    // Кнопки записи/отписки (только если опрос активен)
    if (pollActive) {
      buttons.push([
        Markup.button.callback(t.join, `join_${eventId}`),
        Markup.button.callback(t.leave, `leave_${eventId}`)
      ]);
    }
    
    // Кнопки списка и команд
    buttons.push([
      Markup.button.callback(t.list, `list_${eventId}`),
      Markup.button.callback(t.teams, `teams_${eventId}`)
    ]);
    
    // Кнопки админа
    buttons.push([
      Markup.button.callback(t.reset, `reset_${eventId}`),
      Markup.button.callback(t.delete, `delete_${eventId}`)
    ]);
    
    return Markup.inlineKeyboard(buttons);
  }

  static getWebAppKeyboard(webAppUrl, language = 'ru') {
    const texts = {
      'ru': {
        'continue_creation': 'Продолжить создание',
        'create_event': 'Создать событие'
      },
      'en': {
        'continue_creation': 'Continue Creation',
        'create_event': 'Create Event'
      }
    };

    const t = texts[language] || texts['ru'];
    const buttonText = webAppUrl.includes('continue') ? t.continue_creation : t.create_event;

    return Markup.keyboard([
      [Markup.button.webApp(buttonText, webAppUrl)]
    ]).resize();
  }

  static getGroupHelpKeyboard(botUsername) {
    const deepLink = `https://t.me/${botUsername}?start=group`;
    
    return Markup.inlineKeyboard([
      [Markup.button.url('Создать событие', deepLink)],
      [Markup.button.callback('Помощь', 'help')]
    ]);
  }

  static getAdminKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Сбросить участников', 'admin_reset')],
      [Markup.button.callback('🗑️ Удалить событие', 'admin_delete')],
      [Markup.button.callback('🏈 Разделить на команды', 'admin_teams')]
    ]);
  }

  static getConfirmationKeyboard(action, id) {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('✅ Да', `confirm_${action}_${id}`),
        Markup.button.callback('❌ Нет', `cancel_${action}_${id}`)
      ]
    ]);
  }

  static getBackButton(menu) {
    return Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Назад', `back_to_${menu}`)]
    ]);
  }

  static removeKeyboard() {
    return Markup.removeKeyboard();
  }

  static getLanguageKeyboard() {
    return Markup.inlineKeyboard([
      [
        Markup.button.callback('🇷🇺 Русский', 'set_language_ru'),
        Markup.button.callback('🇺🇸 English', 'set_language_en')
      ]
    ]);
  }
}

module.exports = Keyboards;
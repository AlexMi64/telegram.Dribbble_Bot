// Сервис для работы с заданиями и задачами
const {
  getProjectsForAction,
  getUndoneActionsForProject,
  getCreditsForAction,
  getActionText,
  addActionTransaction,
  getUser,
  updateCredits,
  updateUserRating
} = require('../database/models');
const { t } = require('../utils/lang');

// Сервисные функции управления задачами
class TaskService {

  // Получить доступные задания для пользователя
  static async getAvailableTasks(userId, platforms) {
    try {
      const projects = await getProjectsForAction(userId, platforms);
      return projects.slice(0, 3); // Возвращаем только 3 задания максимум
    } catch (error) {
      return [];
    }
  }

  // Выполнить задание пользователем
  static async performTask(actionType, projectId, userId) {
    try {
      // Получить стоимость действия
      const credits = await getCreditsForAction(projectId, actionType);
      if (!credits) {
        throw new Error('Task credits not found');
      }

      // Создать транзакцию
      const transaction = await addActionTransaction(userId, projectId, actionType);
      if (!transaction) {
        throw new Error('Failed to create transaction');
      }

      // Обновить кредиты пользователя
      const user = await getUser(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await updateCredits(userId, user.credits + credits);

      // Обновить рейтинг пользователя
      await updateUserRating(userId);

      // Начислить 20% рефереру (если есть)
      await TaskService.applyReferralBonus(userId, credits, 'task');

      return {
        success: true,
        creditsEarned: credits,
        totalCredits: user.credits + credits
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Применить реферальный бонус
  static async applyReferralBonus(userId, earnedCredits, source) {
    try {
      const { getUserReferrer } = require('../../db');
      const { updateCredits } = require('../database/models');

      // Получить реферрера пользователя
      const referrer = await getUserReferrer(userId);

      if (!referrer) {
        // У пользователя нет реферрера, ничего не делаем
        return false;
      }

      // Рассчитать бонус (20%)
      const referralBonus = Math.floor(earnedCredits * 0.2);

      if (referralBonus > 0) {
        // Начислить бонус реферреру
        await updateCredits(referrer.referrer_id, referralBonus);
        return true;
      }

      return false;

    } catch (error) {
      return false;
    }
  }

  // Проверить, выполнил ли пользователь задание
  static async checkTaskCompleted(userId, projectId, actionType) {
    try {
      // Импортируем hasUserDoneAction из models
      const { hasUserDoneAction } = require('../database/models');
      return await hasUserDoneAction(userId, projectId, actionType);
    } catch (error) {
      return false;
    }
  }

  // Получить невыполненные действия для проекта
  static async getPendingActions(projectId, userId) {
    try {
      const actions = await getUndoneActionsForProject(projectId, userId);
      return actions;
    } catch (error) {
      return [];
    }
  }

  // Форматировать задание для отображения
  static formatTaskMessage(actionType, project, credits, language = 'ru') {
    const actionWord = t(language, 'action_word_' + actionType);
    const actionVerb = t(language, 'action_verb_' + actionType);
    const text = t(language, 'task_instruction_template', {
      actionVerb: actionVerb,
      url: project.url,
      credits: credits,
      actionWord: actionWord
    });
    return text;
  }
}

module.exports = { TaskService };

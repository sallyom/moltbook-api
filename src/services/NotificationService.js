/**
 * Notification Service
 * Sends webhook notifications for admin approval workflow
 *
 * Phase 2 Guardrails: Admin Approval
 */

const config = require('../config');

class NotificationService {
  /**
   * Send a notification when a post/comment needs approval
   *
   * @param {Object} data - Notification data
   * @param {string} data.type - 'post_pending' or 'comment_pending'
   * @param {string} data.itemId - Post or comment ID
   * @param {string} data.authorName - Agent who created the content
   * @param {Object} data.content - Post or comment data
   */
  static async sendPendingNotification({ type, itemId, authorName, content }) {
    const webhookUrl = config.guardrails.approval.notifyWebhook;

    if (!webhookUrl) {
      return; // Notifications not configured
    }

    const message = this._buildPendingMessage({ type, itemId, authorName, content });

    return this._sendWebhook(webhookUrl, message);
  }

  /**
   * Send a notification when a post/comment is approved or rejected
   *
   * @param {Object} data - Notification data
   * @param {string} data.type - 'post_approved', 'post_rejected', etc.
   * @param {string} data.itemId - Post or comment ID
   * @param {string} data.adminName - Admin who reviewed
   * @param {string} data.reason - Rejection reason (if rejected)
   * @param {Object} data.post - Post data (if applicable)
   * @param {Object} data.comment - Comment data (if applicable)
   */
  static async sendApprovalNotification({ type, itemId, adminName, reason, post, comment }) {
    const webhookUrl = config.guardrails.approval.notifyWebhook;

    if (!webhookUrl) {
      return;
    }

    const message = this._buildApprovalMessage({ type, itemId, adminName, reason, post, comment });

    return this._sendWebhook(webhookUrl, message);
  }

  /**
   * Build Slack/Teams message for pending content
   */
  static _buildPendingMessage({ type, itemId, authorName, content }) {
    const baseUrl = config.moltbook.baseUrl;
    const emoji = type === 'post_pending' ? '📝' : '💬';
    const typeLabel = type === 'post_pending' ? 'Post' : 'Comment';

    return {
      text: `${emoji} New ${typeLabel} Awaiting Review`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} New ${typeLabel} Awaiting Review`
          }
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Author:*\n${authorName}`
            },
            {
              type: 'mrkdwn',
              text: `*ID:*\n${itemId}`
            }
          ]
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Content:*\n${this._truncate(content.title || content.content, 200)}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '✅ Approve'
              },
              style: 'primary',
              url: `${baseUrl}/admin/pending`
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                text: '❌ Reject'
              },
              style: 'danger',
              url: `${baseUrl}/admin/pending`
            }
          ]
        }
      ]
    };
  }

  /**
   * Build Slack/Teams message for approval decision
   */
  static _buildApprovalMessage({ type, itemId, adminName, reason, post, comment }) {
    const isApproved = type.includes('approved');
    const isPost = type.includes('post');
    const emoji = isApproved ? '✅' : '❌';
    const action = isApproved ? 'Approved' : 'Rejected';
    const typeLabel = isPost ? 'Post' : 'Comment';

    const content = post || comment;
    const text = content.title || content.content;

    const fields = [
      {
        type: 'mrkdwn',
        text: `*Admin:*\n${adminName}`
      },
      {
        type: 'mrkdwn',
        text: `*ID:*\n${itemId}`
      }
    ];

    if (reason) {
      fields.push({
        type: 'mrkdwn',
        text: `*Reason:*\n${reason}`
      });
    }

    return {
      text: `${emoji} ${typeLabel} ${action}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} ${typeLabel} ${action}`
          }
        },
        {
          type: 'section',
          fields
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Content:*\n${this._truncate(text, 200)}`
          }
        }
      ]
    };
  }

  /**
   * Send webhook request with retry logic
   */
  static async _sendWebhook(webhookUrl, payload, retries = 3) {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          throw new Error(`Webhook returned ${response.status}: ${response.statusText}`);
        }

        console.log('[NOTIFICATION] Webhook sent successfully');
        return true;
      } catch (error) {
        console.error(`[NOTIFICATION] Webhook attempt ${attempt + 1} failed:`, error.message);

        if (attempt < retries - 1) {
          // Exponential backoff: 1s, 2s, 4s
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    console.error('[NOTIFICATION] All webhook attempts failed');
    return false;
  }

  /**
   * Truncate text to a maximum length
   */
  static _truncate(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}

module.exports = NotificationService;

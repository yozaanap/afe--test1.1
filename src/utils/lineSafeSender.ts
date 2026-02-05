// Utility to sanitize and build safe LINE messages for notifications
// Purpose: prevent message overflow by truncating long fields and producing compact messages

export type ReplyNotification = {
  resUser: {
    users_related_borrow?: string;
    users_fname?: string;
    users_sname?: string;
    users_tel1?: string;
    users_line_id?: string;
  };
  resTakecareperson?: {
    takecare_fname?: string;
    takecare_sname?: string;
    takecare_tel1?: string;
    takecare_id?: number;
  };
  resSafezone?: any;
  extendedHelpId?: number;
  locationData?: {
    locat_latitude?: string;
    locat_longitude?: string;
  };
};

type Options = {
  maxName?: number;
  maxPhone?: number;
  maxRelated?: number;
  includeMapsLink?: boolean;
};

const DEFAULTS: Required<Options> = {
  maxName: 40,
  maxPhone: 20,
  maxRelated: 80,
  includeMapsLink: true,
};

function truncate(s: string | undefined, max: number) {
  if (!s) return '';
  const str = String(s).trim();
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + '…';
}

function safeNumberParse(s?: string) {
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function mapsLink(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '';
  return `https://maps.google.com/?q=${lat},${lon}`;
}

// Build a compact array of LINE 'text' message objects that are safe (truncated)
export function sanitizeNotificationPayload(
  notification: ReplyNotification,
  opts?: Options
) {
  const cfg = { ...DEFAULTS, ...(opts || {}) };
  const u = notification.resUser || ({} as any);
  const t = notification.resTakecareperson || ({} as any);

  const name = truncate(`${u.users_fname || ''} ${u.users_sname || ''}`.trim(), cfg.maxName);
  const related = truncate(u.users_related_borrow || '', cfg.maxRelated);
  const phone = truncate(u.users_tel1 || '' || t.takecare_tel1 || '', cfg.maxPhone);
  const taker = truncate(`${t.takecare_fname || ''} ${t.takecare_sname || ''}`.trim(), cfg.maxName);

  const lat = safeNumberParse(notification.locationData?.locat_latitude);
  const lon = safeNumberParse(notification.locationData?.locat_longitude);
  const link = cfg.includeMapsLink ? mapsLink(lat, lon) : '';

  const lines: string[] = [];
  lines.push('แจ้งเตือนการขอช่วยเหลือ');
  if (name) lines.push(`ชื่อ: ${name}`);
  if (related) lines.push(`เกี่ยวข้อง: ${related}`);
  if (phone) lines.push(`โทร: ${phone}`);
  if (taker) lines.push(`ผู้ดูแล: ${taker}`);
  if (notification.extendedHelpId !== undefined) lines.push(`ID: ${notification.extendedHelpId}`);

  // Primary compact summary message
  const summary = lines.join('\n');

  const messages: Array<{ type: 'text'; text: string }> = [];
  messages.push({ type: 'text', text: summary });

  // Add location link as separate message (short, safe)
  if (link) messages.push({ type: 'text', text: `ตำแหน่ง: ${link}` });

  // If any single field was truncated, append a note with a short web reference (optional)
  const truncatedFields: string[] = [];
  if ((`${u.users_fname || ''} ${u.users_sname || ''}`).length > cfg.maxName) truncatedFields.push('name');
  if ((u.users_related_borrow || '').length > cfg.maxRelated) truncatedFields.push('related');
  if ((u.users_tel1 || '').length > cfg.maxPhone) truncatedFields.push('phone');

  if (truncatedFields.length > 0) {
    const note = `บางข้อมูลถูกย่อ: ${truncatedFields.join(', ')}. ดูรายละเอียดเพิ่มเติมในระบบ.`;
    messages.push({ type: 'text', text: note });
  }

  return { messages, meta: { truncatedFields } };
}

// ============================================================================
// DEDUPLICATION & RATE LIMITING
// ============================================================================

interface NotificationRecord {
  key: string;
  lastSentAt: number;
  extenId: number;
}

// In-memory cache (ในการใช้จริง ควร store ใน Redis หรือ Database)
const sentNotifications = new Map<string, NotificationRecord>();

/**
 * ตรวจสอบว่าเคสนี้เคยส่งแจ้งเตือนใน 5 นาทีที่ผ่านมาหรือไม่
 * ถ้าเคยแล้ว = skip (ป้องกันซ้ำ)
 */
export function shouldSendNotification(
  extendedHelpId: number,
  groupLineId: string,
  minIntervalSeconds = 300 // 5 นาที
): boolean {
  const key = `${groupLineId}:${extendedHelpId}`;
  const record = sentNotifications.get(key);
  const now = Date.now();

  if (record) {
    const elapsedSec = (now - record.lastSentAt) / 1000;
    if (elapsedSec < minIntervalSeconds) {
      console.log(`[SKIPPED] Case ${extendedHelpId} already notified ${Math.round(elapsedSec)}s ago`);
      return false; // ✗ ไม่ส่ง — เคยส่งมาแล้ว
    }
  }

  // ✓ ส่ง + บันทึกการส่ง
  sentNotifications.set(key, { key, lastSentAt: now, extenId: extendedHelpId });
  return true;
}

/**
 * ล้างแคชเก่า (ควรเรียกทุก ๆ นาที)
 * ถ้ารอบไป 10 นาที ให้ลบออก
 */
export function cleanupOldNotifications(maxAgeSeconds = 600) {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, record] of sentNotifications.entries()) {
    const ageSeconds = (now - record.lastSentAt) / 1000;
    if (ageSeconds > maxAgeSeconds) {
      sentNotifications.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) console.log(`[CLEANUP] Removed ${cleaned} old notifications`);
}

/**
 * ตัวอย่างการใช้งานรวม
 *
 * ในไฟล์ที่เรียก replyNotification (เช่น API route):
 *
 * import { sanitizeNotificationPayload, shouldSendNotification } from './utils/lineSafeSender';
 *
 * export const replyNotification = async ({
 *   resUser,
 *   resTakecareperson,
 *   extendedHelpId,
 *   locationData,
 *   groupLineId
 * }) => {
 *   // 1. ตรวจสอบว่าควรส่งหรือไม่ (5 นาทีต่อครั้ง)
 *   if (!shouldSendNotification(extendedHelpId, groupLineId)) {
 *     console.log('Duplicate notification, skipped');
 *     return;
 *   }
 *
 *   // 2. ตัดข้อความให้พอดี (ไม่ overflow)
 *   const { messages } = sanitizeNotificationPayload({
 *     resUser, resTakecareperson, extendedHelpId, locationData
 *   });
 *
 *   // 3. ส่ง messages ไป LINE (ใช้ axios เดิม)
 *   await axios.post(LINE_PUSH_MESSAGING_API, {
 *     to: groupLineId,
 *     messages: [...messages, locationMessage] // รวมกับ location message
 *   }, { headers: LINE_HEADER });
 * };
 */

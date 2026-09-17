/**
 * JpMC Synapse — Google Drive Service
 * Manages saving past/completed events history, generating export archives,
 * and listing previous saved exports on Google Drive.
 */

import { getAccessToken } from './googleAuth';
import { EventEntity } from '../domain/models';

export interface DriveSavedFile {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  size?: string;
  webViewLink?: string;
}

/**
 * Searches for or creates a dedicated folder in Google Drive: "JpMC Synapse Archives"
 */
async function getOrCreateFolder(accessToken: string): Promise<string> {
  const folderName = 'JpMC Synapse Archives';
  const query = encodeURIComponent(`name = '${folderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
  
  const searchRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    console.warn('Error searching drive folders:', errText);
    throw new Error(`Google Drive API search failed: ${searchRes.statusText}`);
  }

  const data = await searchRes.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Create the folder
  const createFolderRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: 'Jamalpur Medical College (JpMC) Synapse past events history and audit logs',
    }),
  });

  if (!createFolderRes.ok) {
    throw new Error('Failed to create JpMC Synapse folder in Google Drive');
  }

  const createdFolder = await createFolderRes.json();
  return createdFolder.id;
}

/**
 * Formats events history into a clean Markdown / Text document for easy reading & archiving
 */
export function formatEventsHistoryText(events: EventEntity[]): string {
  const generatedAt = new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' });
  let doc = `# জামালপুর মেডিকেল কলেজ (JpMC) — কর্মসূচির পূর্ববর্তী ইতিহাস রেকর্ড\n`;
  doc += `Jamalpur Medical College, Jamalpur - 2000, Bangladesh\n`;
  doc += `JpMC Synapse Smart Schedule & Reminder System — Event History Archive\n`;
  doc += `--------------------------------------------------------------------------------\n`;
  doc += `সংগ্রহ ও সংরক্ষণ তারিখ (Generated On): ${generatedAt} (Asia/Dhaka)\n`;
  doc += `মোট সংরক্ষিত কর্মসূচি (Total Events Count): ${events.length} টি\n\n`;

  events.forEach((evt, idx) => {
    doc += `### ${idx + 1}. [${evt.category}] ${evt.title}\n`;
    doc += `- তারিখ (Date): ${evt.eventDate}\n`;
    doc += `- সময় (Time): ${evt.startTime}${evt.endTime ? ` - ${evt.endTime}` : ''}\n`;
    doc += `- স্থান (Venue): ${evt.venue}\n`;
    doc += `- অগ্রাধিকার (Priority): ${evt.priority.toUpperCase()}\n`;
    doc += `- উৎস (Source): ${evt.source}\n`;
    doc += `- অবস্থা (Status): ${evt.isCompleted ? 'সম্পন্ন (Completed)' : 'চলমান/অপেক্ষমান (Active/Past)'}\n`;
    if (evt.committee) doc += `- কমিটি (Committee): ${evt.committee}\n`;
    if (evt.participants) doc += `- অংশগ্রহণকারী (Participants): ${evt.participants}\n`;
    if (evt.description) doc += `- বিবরণ (Description): ${evt.description}\n`;
    if (evt.originalText) doc += `- টেলিগ্রাম মূল বার্তা (Original Message): "${evt.originalText}"\n`;
    doc += `\n--------------------------------------------------------------------------------\n\n`;
  });

  return doc;
}

/**
 * Uploads events history to Google Drive as both JSON and readable Markdown/Text
 */
export async function saveEventHistoryToDrive(
  events: EventEntity[],
  customTitle?: string
): Promise<{ fileId: string; fileName: string; webViewLink?: string }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error('Please sign in with Google to authorize Google Drive upload.');
  }

  const folderId = await getOrCreateFolder(token);

  const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = customTitle
    ? `${customTitle}_${timestampStr}.json`
    : `JpMC_Events_History_Archive_${timestampStr}.json`;

  const payload = {
    institution: 'Jamalpur Medical College (JpMC)',
    system: 'JpMC Synapse',
    exportedAt: new Date().toISOString(),
    dhakaTime: new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }),
    totalEvents: events.length,
    events,
    readableSummary: formatEventsHistoryText(events),
  };

  const fileMetadata = {
    name: fileName,
    parents: [folderId],
    mimeType: 'application/json',
    description: `JpMC Synapse history record of ${events.length} past events`,
  };

  // Multipart upload to Google Drive v3
  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(fileMetadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(payload, null, 2) +
    closeDelimiter;

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    console.warn('Drive upload failed:', err);
    throw new Error(`Google Drive upload failed: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    fileId: result.id,
    fileName: result.name,
    webViewLink: result.webViewLink,
  };
}

/**
 * Lists previously uploaded JpMC history files from the user's Google Drive
 */
export async function listDriveHistoryFiles(): Promise<DriveSavedFile[]> {
  const token = await getAccessToken();
  if (!token) return [];

  try {
    const folderId = await getOrCreateFolder(token);
    const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,createdTime,size,webViewLink)&orderBy=createdTime desc`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      console.warn('Failed to list drive files:', await res.text());
      return [];
    }

    const data = await res.json();
    return data.files || [];
  } catch (err) {
    console.warn('Error listing drive files:', err);
    return [];
  }
}

/**
 * Deletes a file from Google Drive (Requires explicit confirmation before calling)
 */
export async function deleteDriveFile(fileId: string): Promise<boolean> {
  const token = await getAccessToken();
  if (!token) throw new Error('Google authorization token missing');

  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  return res.ok;
}

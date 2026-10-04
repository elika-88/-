// Leave room for multipart metadata below the hosting platform's 4.5 MB limit.
export const COURSE_FILE_LIMITS = { maxBytes: 4 * 1024 * 1024, maxCharacters: 60_000 } as const;
export const COURSE_FILE_SIZE_ERROR = 'Files must be 4 MB or smaller. Compress or split the document, or paste its text instead.';
export const COURSE_FILE_ACCEPT = '.pdf,.ppt,.pptx,.docx,.txt,.md,.markdown,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';

export type SupportedCourseFile = 'pdf' | 'pptx' | 'docx' | 'text';
export const COURSE_FILE_TYPES: Record<string, SupportedCourseFile> = {
  pdf: 'pdf', pptx: 'pptx', docx: 'docx', txt: 'text', md: 'text', markdown: 'text',
};
export const COURSE_MIME_TYPES: Record<string, SupportedCourseFile> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'text', 'text/markdown': 'text',
};

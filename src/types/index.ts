export interface CrawlerTask {
  id: string;
  name: string;
  type: 'webpage' | 'video' | 'live';
  url: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  content?: string;
  summary?: string;
  audioFile?: string;
  isRecording?: boolean;
}

export interface LLMConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}
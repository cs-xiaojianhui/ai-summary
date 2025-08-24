import type { CrawlerTask } from '../types';
import { LLMStorage } from './llmStorage';

const API_BASE_URL = 'http://localhost:3001/api';

/**
 * 任务存储管理类
 */
class TaskStorage {
  private llmStorage: LLMStorage;
  /**
   * 保存任务到后端
   * @param task 爬取任务
   */
  constructor() {
    this.llmStorage = new LLMStorage();
  }

  /**
   * 保存任务到后端
   * @param task 爬取任务
   */
  async saveTask(task: CrawlerTask): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(task)
      });

      if (!response.ok) {
        throw new Error(`保存任务失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('保存任务失败:', error);
      throw new Error('保存任务失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 根据ID获取任务
   * @param id 任务ID
   * @returns 爬取任务
   */
  async getTask(id: string): Promise<CrawlerTask | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`获取任务失败: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('读取任务失败:', error);
      return null;
    }
  }

  /**
   * 获取所有任务
   * @returns 任务列表
   */
  async getAllTasks(): Promise<CrawlerTask[]> {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks`);
      
      if (!response.ok) {
        throw new Error(`获取任务列表失败: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('读取任务列表失败:', error);
      return [];
    }
  }

  /**
   * 删除任务
   * @param id 任务ID
   */
  async deleteTask(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/tasks/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error(`删除任务失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('删除任务失败:', error);
      throw new Error('删除任务失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 获取网页内容 (模拟实现)
   * @param url 网页URL
   * @returns 网页内容
   */
  async fetchWebPageContent(url: string): Promise<string> {
    try {
      // 在实际应用中，这里需要通过后端服务来获取网页内容，
      // 因为浏览器有跨域限制，无法直接获取其他网站的内容
      // 这里我们模拟返回一些内容
      await new Promise(resolve => setTimeout(resolve, 1000)); // 模拟网络延迟
      
      return `网页内容来自: ${url}

标题: 示例网页标题

正文:
这是示例网页的内容。在实际应用中，这里会是从指定URL获取的完整网页内容。
内容可能包括文章正文、产品描述、新闻报道等各种类型的文本信息。

章节一:
这是网页的第一个主要内容部分。通常包含核心信息和关键要点。

章节二:
这是网页的第二个主要内容部分。可能会包含详细说明、示例或相关链接。

章节三:
这是网页的第三个主要内容部分。可能包含结论、总结或其他相关信息。

总结:
该网页主要介绍了...内容，对于...具有重要参考价值。`;
    } catch (error) {
      console.error('获取网页内容失败:', error);
      throw new Error('获取网页内容失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 调用LLM生成摘要 (模拟实现)
   * @param content 网页内容
   * @returns 摘要内容
   */
  async generateSummary(content: string): Promise<string> {
    try {
      // 获取LLM配置
      const config = await this.llmStorage.getConfig();
      if (!config) {
        throw new Error('请先配置LLM参数');
      }

      // 在实际应用中，这里需要通过后端服务调用LLM API
      // 这里我们模拟API调用
      await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟API调用延迟
      
      // 模拟LLM返回的字符串格式摘要
      return `# 网页内容摘要

## 概述
该网页主要介绍了示例内容，包含多个章节的详细信息。

## 主要内容
- **章节一**: 介绍了网页的第一个主要内容部分，通常包含核心信息和关键要点
- **章节二**: 包含详细说明、示例或相关链接
- **章节三**: 可能包含结论、总结或其他相关信息

## 关键信息
1. 网页标题为"示例网页标题"
2. 内容来自指定的URL
3. 包含三个主要章节

## 总结
该网页内容结构清晰，信息丰富，对于了解相关主题具有重要参考价值。`;
    } catch (error) {
      console.error('生成摘要失败:', error);
      throw new Error('生成摘要失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 处理网页任务：获取内容并生成摘要
   * @param taskId 任务ID
   */
  async processWebPageTask(taskId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/process-webpage/${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `处理任务失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('处理网页任务失败:', error);
      throw new Error('处理网页任务失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 开始直播录制
   * @param taskId 任务ID
   */
  async startLiveRecording(taskId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/start-recording/${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `开始录制失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('开始直播录制失败:', error);
      throw new Error('开始直播录制失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 停止直播录制
   * @param taskId 任务ID
   */
  async stopLiveRecording(taskId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/stop-recording/${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `停止录制失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('停止直播录制失败:', error);
      throw new Error('停止直播录制失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 处理录制失败
   * @param taskId 任务ID
   */
  async recordingFailed(taskId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/recording-failed/${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `更新失败状态失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('处理录制失败:', error);
      throw new Error('处理录制失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 生成音频摘要
   * @param taskId 任务ID
   */
  async generateAudioSummary(taskId: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/generate-audio-summary/${taskId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `生成摘要失败: ${response.status} ${response.statusText}`);
      }
      
      // 获取响应数据
      const result = await response.json();
      
      // 如果返回了ossInfo，说明需要前端生成预签名URL并继续处理
      if (result.ossInfo) {
        // 如果返回了fileUrl，直接使用它进行后续处理
        if (result.ossInfo.fileUrl) {
          // 直接处理音频摘要，因为已经有了公网可访问的URL
          await this.processAudioSummaryWithUrl(result.ossInfo.taskId, result.ossInfo.fileUrl);
        } else {
          // 触发生成预签名URL和后续处理的逻辑
          window.dispatchEvent(new CustomEvent('audioSummaryReady', {
            detail: {
              taskId: result.ossInfo.taskId,
              fileName: result.ossInfo.fileName
            }
          }));
        }
      }
    } catch (error) {
      console.error('生成音频摘要失败:', error);
      throw new Error('生成音频摘要失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 使用公网URL处理音频摘要
   * @param taskId 任务ID
   * @param fileUrl 文件公网URL
   */
  async processAudioSummaryWithUrl(taskId: string, fileUrl: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/process-audio-summary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          taskId,
          fileUrl
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `处理音频摘要失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('处理音频摘要失败:', error);
      throw new Error('处理音频摘要失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }
}

export default new TaskStorage();
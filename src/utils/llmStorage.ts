import type { LLMConfig } from '../types';

const API_BASE_URL = 'http://localhost:3001/api';
const CONFIG_ENDPOINT = `${API_BASE_URL}/llm-config`;

/**
 * LLM配置存储管理类
 */
export class LLMStorage {
  /**
   * 保存LLM配置
   * @param config LLM配置
   */
  async saveConfig(config: LLMConfig): Promise<void> {
    try {
      const response = await fetch(CONFIG_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config)
      });

      if (!response.ok) {
        throw new Error(`保存LLM配置失败: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('保存LLM配置失败:', error);
      throw new Error('保存LLM配置失败: ' + (error instanceof Error ? error.message : '未知错误'));
    }
  }

  /**
   * 获取LLM配置
   * @returns LLM配置
   */
  async getConfig(): Promise<LLMConfig | null> {
    try {
      const response = await fetch(CONFIG_ENDPOINT);
      
      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`获取LLM配置失败: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('读取LLM配置失败:', error);
      return null;
    }
  }

  /**
   * 删除LLM配置
   */
  async deleteConfig(): Promise<void> {
    // 在这个实现中，我们不提供删除配置的功能
    throw new Error('删除LLM配置功能未实现');
  }
}

export default new LLMStorage();
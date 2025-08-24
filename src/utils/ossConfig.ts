// OSS配置工具函数

export interface OSSConfig {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  region: string;
  roleArn: string;
}

// 获取OSS配置
export async function fetchOSSConfig(): Promise<OSSConfig | null> {
  try {
    const response = await fetch('http://localhost:3001/api/oss-config');
    if (!response.ok) {
      throw new Error(`获取OSS配置失败: ${response.status} ${response.statusText}`);
    }
    const config = await response.json();
    return config;
  } catch (error) {
    console.error('获取OSS配置失败:', error);
    return null;
  }
}

// 保存OSS配置
export async function saveOSSConfig(config: OSSConfig): Promise<void> {
  try {
    const response = await fetch('http://localhost:3001/api/oss-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `保存OSS配置失败: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error('保存OSS配置失败:', error);
    throw error;
  }
}
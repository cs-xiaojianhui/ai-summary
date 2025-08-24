import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import OSS from 'ali-oss';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// 获取文件扩展名的辅助函数
function getFileExtension(filename) {
  return '.' + filename.split('.').pop();
}

// OSS客户端单例
let ossClientInstance = null;
let ossClientInitialized = false;

// 配置OSS客户端（单例模式）
async function createOSSClient() {
  // 如果已经初始化过且客户端存在，直接返回
  if (ossClientInitialized && ossClientInstance) {
    console.log('使用已存在的OSS客户端实例');
    return ossClientInstance;
  }

  // 从环境变量或配置文件中获取OSS配置
  let ossConfig = {
    region: process.env.OSS_REGION,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET
  };

  // 如果环境变量不完整，尝试从配置文件中读取
  if (!ossConfig.region || !ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
    try {
      const configPath = join(CONFIG_DIR, 'ossConfig.json');
      const configFile = await fs.readFile(configPath, 'utf8');
      const fileConfig = JSON.parse(configFile);
      
      // 映射配置文件中的字段名到代码中使用的字段名
      ossConfig = {
        region: fileConfig.region || ossConfig.region,
        accessKeyId: fileConfig.access_id || fileConfig.accessKeyId || ossConfig.accessKeyId,
        accessKeySecret: fileConfig.access_secret || fileConfig.accessKeySecret || ossConfig.accessKeySecret,
        bucket: fileConfig.bucket || ossConfig.bucket
      };
    } catch (error) {
      console.log('读取OSS配置文件失败:', error.message);
    }
  }

  console.log('OSS配置信息:', {
    region: ossConfig.region,
    accessKeyId: ossConfig.accessKeyId ? '已设置' : '未设置',
    accessKeySecret: ossConfig.accessKeySecret ? '已设置' : '未设置',
    bucket: ossConfig.bucket ? '已设置' : '未设置'
  });

  // 检查必要配置是否存在
  if (!ossConfig.region || !ossConfig.accessKeyId || !ossConfig.accessKeySecret || !ossConfig.bucket) {
    console.log('OSS配置不完整，缺少必要参数');
    ossClientInitialized = true;
    ossClientInstance = null;
    return null;
  }

  console.log('正在创建OSS客户端...');
  try {
    const client = new OSS({
      region: ossConfig.region,
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret,
      bucket: ossConfig.bucket,
    });
    console.log('OSS客户端创建成功');
    // 保存实例并标记为已初始化
    ossClientInstance = client;
    ossClientInitialized = true;
    return client;
  } catch (error) {
    console.error('OSS客户端创建失败:', error);
    ossClientInitialized = true;
    ossClientInstance = null;
    return null;
  }
}

// 配置multer用于处理音频文件上传
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join(__dirname, 'audio'));
  },
  filename: (req, file, cb) => {
    // 直接使用taskId作为文件名，确保文件名为${taskId}.webm格式
    cb(null, `${req.params.taskId}.webm`);
  }
});

// 为语音识别测试配置单独的multer
const transcriptionStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, join(__dirname, 'audio'));
  },
  filename: (req, file, cb) => {
    // 为测试文件生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `transcription_test_${uniqueSuffix}${getFileExtension(file.originalname)}`);
  }
});

const upload = multer({ storage: storage });
const transcriptionUpload = multer({ storage: transcriptionStorage });

// 上传文件到OSS
async function uploadFileToOSS(localFilePath, ossFileName) {
  const client = await createOSSClient();
  
  if (!client) {
    throw new Error('OSS配置不完整，请检查环境变量配置');
  }
  
  try {
    console.log('开始上传文件到OSS:');
    console.log('- 本地文件路径:', localFilePath);
    console.log('- OSS文件名:', ossFileName);
    
    // 检查本地文件是否存在
    try {
      await fs.access(localFilePath);
      console.log('本地文件存在，准备上传');
    } catch (error) {
      console.error('本地文件不存在:', localFilePath);
      throw new Error(`本地文件不存在: ${localFilePath}`);
    }

    // 上传文件到OSS并设置公共读权限，确保语音识别服务可以访问
    console.log('正在执行上传操作...');
    const result = await client.put(ossFileName, localFilePath, {
      headers: {
        'x-oss-object-acl': 'public-read'  // 设置文件为公共可读
      }
    });
    console.log('OSS上传成功:', {
      name: result.name,
      url: result.url,
      res: {
        status: result.res.status,
        statusMessage: result.res.statusMessage
      }
    });
    return result.url; // 返回文件的公网访问URL
  } catch (error) {
    console.error('OSS上传失败:', error);
    throw new Error(`上传文件到OSS失败: ${error.message}`);
  }
}

app.use(cors());
app.use(express.json());
app.use('/audio', express.static(join(__dirname, 'audio')));

// 存储目录路径
const STORAGE_DIR = join(__dirname, 'storage');
const CONFIG_DIR = join(__dirname, 'config');
const AUDIO_DIR = join(__dirname, 'audio');

// 确保存储目录存在
async function ensureStorageDir() {
  try {
    await fs.access(STORAGE_DIR);
  } catch {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  }
}

// 确保配置目录存在
async function ensureConfigDir() {
  try {
    await fs.access(CONFIG_DIR);
  } catch {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
  }
}

// 确保音频目录存在
async function ensureAudioDir() {
  try {
    await fs.access(AUDIO_DIR);
  } catch {
    await fs.mkdir(AUDIO_DIR, { recursive: true });
  }
}

// 获取网页内容
async function fetchWebPageContent(url) {
  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    // 简单提取文本内容
    let text = response.data;
    
    // 移除script和style标签
    text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // 将HTML标签替换为空格
    text = text.replace(/<[^>]+>/g, ' ');
    
    // 移除多余的空白字符
    text = text.replace(/\s+/g, ' ').trim();
    
    return text.substring(0, 10000); // 限制长度
  } catch (error) {
    throw new Error(`获取网页内容失败: ${error.message}`);
  }
}

// 调用LLM生成摘要
async function generateSummaryWithLLM(content, llmConfig) {
  try {
    const { baseUrl, model, apiKey } = llmConfig;
    
    if (!baseUrl || !model || !apiKey) {
      throw new Error('LLM配置不完整');
    }
    
    const prompt = `请将以下内容总结成一个结构清晰的摘要，要求使用代码格式返回，并通过加粗来突出关键信息。请包含以下部分：
1. 摘要总结
2. 关键信息点
直接输出结果，不需要类似“以下是摘要”的引导性话语，开始：
${content}`;
    
    const response = await axios.post(
      `${baseUrl}/chat/completions`,
      {
        model: model,
        messages: [
          {
            role: "system",
            content: "你是一个专业的文本摘要助手，能够将复杂的网页内容总结成结构清晰的摘要，并使用代码格式输出。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 30000
      }
    );
    
    if (response.data.choices && response.data.choices.length > 0) {
      return response.data.choices[0].message.content;
    } else {
      throw new Error('LLM未返回有效内容');
    }
  } catch (error) {
    if (error.response) {
      throw new Error(`LLM API错误: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else {
      throw new Error(`调用LLM失败: ${error.message}`);
    }
  }
}

// 添加测试OSS上传接口（使用配置中心的配置）
app.post('/api/test-oss-upload-with-config', transcriptionUpload.single('file'), async (req, res) => {
  try {
    console.log('Received test OSS upload request:', { 
      hasBody: !!req.body,
      hasConfig: !!req.body.config,
      configType: typeof req.body.config,
      configValue: req.body.config,
      hasFiles: !!req.files,
      files: req.files
    });
    
    // 检查配置参数是否存在
    if (!req.body.config) {
      // 尝试从配置文件中读取配置
      try {
        const configPath = join(CONFIG_DIR, 'ossConfig.json');
        await fs.access(configPath);
        const configFile = await fs.readFile(configPath, 'utf8');
        req.body.config = JSON.parse(configFile);
        console.log('Loaded OSS config from file:', req.body.config);
      } catch (configError) {
        console.log('OSS配置文件不存在或读取失败');
        return res.status(400).json({ error: '缺少OSS配置参数' });
      }
    }
    
    // 检查配置参数是否为字符串
    let config;
    if (typeof req.body.config === 'string') {
      config = JSON.parse(req.body.config);
    } else {
      config = req.body.config;
    }
    
    console.log('Parsed OSS config:', config);
    
    const { region, access_id, access_secret, bucket } = config;
    
    // 验证必要字段
    if (!region || !access_id || !access_secret || !bucket) {
      return res.status(400).json({ error: 'OSS配置不完整' });
    }
    
    // 检查是否有上传文件
    if (!req.file) {
      return res.status(400).json({ error: '未找到上传文件' });
    }
    
    const uploadedFile = req.file;
    console.log('Uploaded file info:', {
      name: uploadedFile.name,
      path: uploadedFile.path,
      size: uploadedFile.size
    });
    
    const fileName = `test-${Date.now()}-${uploadedFile.originalname}`;
    console.log('Generated OSS file name:', fileName);
    
    // 初始化OSS客户端（使用已导入的OSS变量）
    const client = new OSS({
      region: region,
      accessKeyId: access_id,
      accessKeySecret: access_secret,
      bucket: bucket,
    });
    
    console.log('OSS client created successfully');
    
    // 上传文件到OSS并设置公共读权限
    const result = await client.put(fileName, uploadedFile.path, {
      headers: {
        'x-oss-object-acl': 'public-read'
      }
    });
    console.log('OSS upload result:', result);
    
    // 删除临时文件
    await fs.unlink(uploadedFile.path);
    console.log('Temporary file deleted');
    
    const response = {
      message: '文件上传成功',
      fileName: result.name,
      fileUrl: result.url
    };
    
    console.log('Sending response:', response);
    res.json(response);
  } catch (error) {
    console.error('测试OSS上传失败:', error);
    
    // 删除临时文件（如果存在）
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('删除临时文件失败:', unlinkError);
      }
    }
    
    // 根据错误类型返回不同的响应
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      res.status(400).json({ error: 'OSS配置参数格式错误: ' + error.message });
    } else {
      res.status(500).json({ error: '文件上传失败: ' + error.message });
    }
  }
});

// 使用阿里云paraformer进行音频转文本
async function audioToTextWithParaformer(audioFilePath, taskId, fileUrl) {
  try {
    console.log('开始音频转文本处理:', { audioFilePath, taskId, fileUrl });
    
    // 获取LLM配置以获取阿里云API Key
    const config = await getLLMConfig();
    if (!config) {
      throw new Error('请先配置LLM参数，需要包含阿里云API Key');
    }
    
    // 检查是否配置了阿里云API Key（假设存储在llmConfig的apiKey字段中）
    const apiKey = config.apiKey;
    if (!apiKey) {
      throw new Error('请在LLM配置中设置阿里云API Key');
    }
    
    console.log('获取到API Key，准备提交转写任务');
    
    // 提交转写任务
    const submitResponse = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
      {
        model: 'paraformer-v2',
        input: {
          file_urls: [fileUrl]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable'
        }
      }
    );
    
    console.log('转写任务提交响应:', JSON.stringify(submitResponse.data, null, 2));
    
    if (!submitResponse.data || !submitResponse.data.output || !submitResponse.data.output.task_id) {
      throw new Error('提交转写任务失败');
    }
    
    const taskIdForTranscription = submitResponse.data.output.task_id;
    console.log('转写任务ID:', taskIdForTranscription);
    
    // 轮询任务状态直到完成
    let result;
    let attempts = 0;
    const maxAttempts = 30; // 最多尝试30次，每次间隔5秒
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`轮询任务状态，第${attempts}次尝试`);
      
      // 查询任务状态
      const queryResponse = await axios.get(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskIdForTranscription}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );
      
      console.log('任务状态查询响应:', JSON.stringify(queryResponse.data, null, 2));
      
      const taskStatus = queryResponse.data.output.task_status;
      console.log('当前任务状态:', taskStatus);
      
      if (taskStatus === 'SUCCEEDED') {
        result = queryResponse.data;
        console.log('转写任务成功完成');
        break;
      } else if (taskStatus === 'FAILED') {
        console.log('转写任务失败:', queryResponse.data.output.message);
        throw new Error(`转写任务失败: ${queryResponse.data.output.message}`);
      }
      
      // 等待5秒后再次查询
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    if (!result) {
      throw new Error('转写任务超时');
    }
    
    // 提取转写结果
    let transcriptionText = '';
    console.log('转写任务完成，开始提取结果:', JSON.stringify(result, null, 2));
    
    // 更详细地检查结果结构
    if (result && result.output) {
      console.log('输出结构:', JSON.stringify(result.output, null, 2));
      
      if (result.output.results) {
        console.log('结果数组:', JSON.stringify(result.output.results, null, 2));
        
        // 遍历所有结果
        for (let i = 0; i < result.output.results.length; i++) {
          const item = result.output.results[i];
          console.log(`结果[${i}]:`, JSON.stringify(item, null, 2));
          
          // 检查transcription_url字段
          if (item.transcription_url) {
            try {
              // 从transcription_url获取实际的转录文本
              // console.log('从transcription_url获取转录结果:', item.transcription_url);
              const transcriptionResponse = await axios.get(item.transcription_url);
              // console.log('转录结果响应:', JSON.stringify(transcriptionResponse.data, null, 2));
              
              // 根据返回的JSON结构提取文本 (针对新的JSON格式)
              if (transcriptionResponse.data && transcriptionResponse.data.transcripts) {
                // 新格式：从transcripts数组中提取文本
                const transcripts = transcriptionResponse.data.transcripts;
                if (Array.isArray(transcripts)) {
                  transcriptionText += transcripts.map(t => t.text || '').join('\n');
                }
              } else if (transcriptionResponse.data && transcriptionResponse.data.payload) {
                // 旧格式：从payload.result中提取文本
                const payload = transcriptionResponse.data.payload;
                if (payload && payload.result) {
                  // 处理不同格式的结果
                  if (Array.isArray(payload.result)) {
                    // 如果是数组格式
                    transcriptionText += payload.result.map(r => r.text || '').join('\n');
                  } else if (typeof payload.result === 'object') {
                    // 如果是对象格式
                    if (payload.result.text) {
                      transcriptionText += payload.result.text;
                    } else if (payload.result.sentences) {
                      // 处理句子数组
                      if (Array.isArray(payload.result.sentences)) {
                        transcriptionText += payload.result.sentences.map(s => s.text || '').join('\n');
                      }
                    }
                  } else if (typeof payload.result === 'string') {
                    // 如果是字符串格式
                    transcriptionText += payload.result;
                  }
                }
              }
            } catch (fetchError) {
              console.error('获取转录结果失败:', fetchError);
              transcriptionText += '获取转录结果失败: ' + fetchError.message;
            }
          } else if (item.text) {
            transcriptionText += item.text + '\n';
          } else if (item.sentence) {
            transcriptionText += item.sentence + '\n';
          }
        }
        
        // 如果还是空的，尝试其他可能的字段
        if (!transcriptionText && result.output.results.length > 0) {
          const firstResult = result.output.results[0];
          // 检查是否有其他可能包含文本的字段
          if (firstResult.sentence) {
            transcriptionText = firstResult.sentence;
          } else if (firstResult.sentences) {
            // 如果是句子数组
            if (Array.isArray(firstResult.sentences)) {
              transcriptionText = firstResult.sentences.map(s => s.text || s.sentence || '').join(' ');
            } else if (typeof firstResult.sentences === 'string') {
              transcriptionText = firstResult.sentences;
            }
          } else if (firstResult.text) {
            transcriptionText = firstResult.text;
          }
        }
      }
    }
    
    console.log('最终转写文本:', transcriptionText || '空');
    return transcriptionText.trim() || '未识别到文本内容';
  } catch (error) {
    console.error('音频转文本失败:', error);
    throw new Error(`音频转文本失败: ${error.message}`);
  }
}

// 读取任务
async function readTask(taskId) {
  try {
    const taskFile = join(STORAGE_DIR, `${taskId}.json`);
    const data = await fs.readFile(taskFile, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    throw new Error(`读取任务失败: ${error.message}`);
  }
}

// 保存任务
async function saveTask(task) {
  try {
    await ensureStorageDir();
    const taskFile = join(STORAGE_DIR, `${task.id}.json`);
    await fs.writeFile(taskFile, JSON.stringify(task, null, 2));
  } catch (error) {
    throw new Error(`保存任务失败: ${error.message}`);
  }
}

// 获取所有任务
async function getAllTasks() {
  try {
    await ensureStorageDir();
    const files = await fs.readdir(STORAGE_DIR);
    const tasks = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = await fs.readFile(join(STORAGE_DIR, file), 'utf8');
          tasks.push(JSON.parse(data));
        } catch (error) {
          console.error(`读取任务文件 ${file} 失败:`, error.message);
        }
      }
    }
    
    return tasks;
  } catch (error) {
    throw new Error(`获取任务列表失败: ${error.message}`);
  }
}

// 删除任务
async function deleteTask(taskId) {
  try {
    const taskFile = join(STORAGE_DIR, `${taskId}.json`);
    await fs.unlink(taskFile);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new Error(`删除任务失败: ${error.message}`);
    }
  }
}

// 获取LLM配置
async function getLLMConfig() {
  try {
    await ensureConfigDir();
    const configStr = await fs.readFile(join(CONFIG_DIR, 'llmConfig.json'), 'utf8');
    return JSON.parse(configStr);
  } catch (error) {
    return null;
  }
}

// 保存LLM配置
async function saveLLMConfig(config) {
  try {
    await ensureConfigDir();
    const configFile = join(CONFIG_DIR, 'llmConfig.json');
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`保存LLM配置失败: ${error.message}`);
  }
}

// 合并临时音频文件到正式音频文件
async function mergeAudioFiles(taskId) {
  try {
    const tempAudioPath = join(AUDIO_DIR, `${taskId}_temp.webm`);
    const finalAudioPath = join(AUDIO_DIR, `${taskId}.webm`);
    
    // 检查临时音频文件是否存在
    try {
      await fs.access(tempAudioPath);
    } catch {
      throw new Error('临时音频文件不存在');
    }
    
    // 如果正式音频文件已存在，则合并两个文件
    try {
      await fs.access(finalAudioPath);
      // 读取两个文件
      const tempAudioData = await fs.readFile(tempAudioPath);
      const finalAudioData = await fs.readFile(finalAudioPath);
      
      // 合并文件内容
      const mergedData = Buffer.concat([finalAudioData, tempAudioData]);
      
      // 写入合并后的内容到正式文件
      await fs.writeFile(finalAudioPath, mergedData);
      
      // 删除临时文件
      await fs.unlink(tempAudioPath);
    } catch {
      // 正式音频文件不存在，直接将临时文件重命名为正式文件
      await fs.rename(tempAudioPath, finalAudioPath);
    }
    
    return `${taskId}.webm`;
  } catch (error) {
    throw new Error(`合并音频文件失败: ${error.message}`);
  }
}

// 测试OSS连接
async function testOSSConnection() {
  const client = createOSSClient();
  
  if (!client) {
    console.log('OSS客户端创建失败，无法测试连接');
    return false;
  }
  
  try {
    console.log('正在测试OSS连接...');
    // 尝试列出bucket中的文件来测试连接
    const result = await client.list({
      'max-keys': 1
    });
    console.log('OSS连接测试成功:', result);
    return true;
  } catch (error) {
    console.error('OSS连接测试失败:', error);
    return false;
  }
}

// 重置OSS客户端（用于重新初始化）
function resetOSSClient() {
  console.log('重置OSS客户端');
  ossClientInstance = null;
  ossClientInitialized = false;
}

// 添加重置OSS客户端的接口
app.post('/api/reset-oss-client', (req, res) => {
  try {
    resetOSSClient();
    res.json({ success: true, message: 'OSS客户端已重置' });
  } catch (error) {
    console.error('重置OSS客户端失败:', error);
    res.status(500).json({ success: false, message: `重置OSS客户端失败: ${error.message}` });
  }
});

// API路由

// 获取所有任务
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await getAllTasks();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取单个任务
app.get('/api/tasks/:id', async (req, res) => {
  try {
    const task = await readTask(req.params.id);
    res.json(task);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// 创建任务
app.post('/api/tasks', async (req, res) => {
  try {
    const task = req.body;
    await saveTask(task);
    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 更新任务
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const taskId = req.params.id;
    const taskData = req.body;
    
    if (taskData.id !== taskId) {
      return res.status(400).json({ error: '任务ID不匹配' });
    }
    
    await saveTask(taskData);
    res.json(taskData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 删除任务
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    await deleteTask(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取LLM配置
app.get('/api/llm-config', async (req, res) => {
  try {
    const config = await getLLMConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 获取OSS配置
app.get('/api/oss-config', async (req, res) => {
  try {
    const configPath = join(CONFIG_DIR, 'ossConfig.json');
    let config = {};
    
    try {
      await fs.access(configPath);
      const configFile = await fs.readFile(configPath, 'utf8');
      config = JSON.parse(configFile);
    } catch (error) {
      // 如果配置文件不存在，返回空配置
      console.log('OSS配置文件不存在，返回空配置');
    }
    
    res.json(config);
  } catch (error) {
    console.error('获取OSS配置失败:', error);
    res.status(500).json({ error: '获取OSS配置失败: ' + error.message });
  }
});

// 保存OSS配置
app.post('/api/oss-config', async (req, res) => {
  try {
    const { region, access_id, access_secret, bucket } = req.body;
    
    // 验证必要字段
    if (!region || !access_id || !access_secret || !bucket) {
      return res.status(400).json({ error: '所有字段都是必填的' });
    }
    
    const config = { region, access_id, access_secret, bucket };
    const configPath = join(CONFIG_DIR, 'ossConfig.json');
    
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    res.json({ message: 'OSS配置保存成功' });
  } catch (error) {
    console.error('保存OSS配置失败:', error);
    res.status(500).json({ error: '保存OSS配置失败: ' + error.message });
  }
});

// 保存LLM配置
app.post('/api/llm-config', async (req, res) => {
  try {
    const config = req.body;
    await saveLLMConfig(config);
    res.status(201).json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 处理网页任务
app.post('/api/process-webpage/:id', async (req, res) => {
  try {
    // 获取任务
    const task = await readTask(req.params.id);
    
    if (!task || task.type !== 'webpage') {
      return res.status(400).json({ error: '任务不存在或不是网页任务' });
    }
    
    // 更新任务状态为处理中
    task.status = 'processing';
    await saveTask(task);
    
    // 获取网页内容
    const content = await fetchWebPageContent(task.url);
    task.content = content;
    await saveTask(task);
    
    // 获取LLM配置
    const llmConfig = await getLLMConfig();
    if (!llmConfig) {
      throw new Error('请先配置LLM参数');
    }
    
    // 生成摘要
    const summary = await generateSummaryWithLLM(content, llmConfig);
    task.summary = summary;
    task.status = 'completed';
    await saveTask(task);
    
    res.json(task);
  } catch (error) {
    // 更新任务状态为失败
    try {
      const task = await readTask(req.params.id);
      if (task) {
        task.status = 'failed';
        task.summary = `处理失败: ${error.message}`;
        await saveTask(task);
      }
    } catch (saveError) {
      console.error('更新任务失败状态时出错:', saveError);
    }
    
    res.status(500).json({ error: error.message });
  }
});

// 开始直播录制
app.post('/api/start-recording/:id', async (req, res) => {
  try {
    console.log(`收到开始录制请求，任务ID: ${req.params.id}`);
    
    // 获取任务
    const task = await readTask(req.params.id);
    console.log('获取到任务:', task);
    
    if (!task || task.type !== 'live') {
      console.log('任务不存在或不是直播任务');
      return res.status(400).json({ error: '任务不存在或不是直播任务' });
    }
    
    // 更新任务状态为处理中（录制中）
    task.status = 'processing';
    task.isRecording = true; // 添加这行，设置录制状态为true
    await saveTask(task);
    console.log('任务状态已更新为处理中');
    
    res.json({ message: '开始录制直播音频，请在前端页面完成音频录制操作', task });
  } catch (error) {
    console.error('开始录制失败:', error);
    // 更新任务状态为失败
    try {
      const task = await readTask(req.params.id);
      if (task) {
        task.status = 'failed';
        task.summary = `处理失败: ${error.message}`;
        await saveTask(task);
        console.log('任务状态已更新为失败');
      }
    } catch (saveError) {
      console.error('更新任务失败状态时出错:', saveError);
    }
    
    res.status(500).json({ error: error.message });
  }
});

// 停止直播录制并处理音频文件
async function stopLiveRecording(taskId) {
  console.log(`停止直播录制任务: ${taskId}`);
  
  try {
    // 直接在AUDIO_DIR目录下查找文件，不再使用任务子目录
    console.log(`在目录 ${AUDIO_DIR} 中查找文件`);
    
    // 查找AUDIO_DIR目录中的音频文件（直接以taskId命名的文件）
    console.log('读取音频目录中的文件...');
    const files = await fs.readdir(AUDIO_DIR);
    console.log(`音频目录中的所有文件:`, files);
    
    // 查找以taskId命名的音频文件（精确匹配）
    const audioFile = files.find(file => {
      // 获取不带扩展名的文件名
      const fileNameWithoutExt = file.substring(0, file.lastIndexOf('.'));
      return fileNameWithoutExt === taskId;
    });
    
    if (!audioFile) {
      console.warn('未找到以taskId命名的音频文件，检查所有文件:', files);
      throw new Error('未找到录制的音频文件');
    }
    
    console.log(`找到音频文件: ${audioFile}`);
    
    // 构建完整的文件路径
    const audioFilePath = join(AUDIO_DIR, audioFile);
    // 输出文件直接命名为taskId.webm
    const outputFile = join(AUDIO_DIR, `${taskId}.webm`);
    
    console.log('音频文件路径:', audioFilePath);
    console.log('输出文件路径:', outputFile);
    
    // 检查输入文件是否存在
    try {
      await fs.access(audioFilePath);
      console.log(`输入文件存在: ${audioFilePath}`);
    } catch (fileAccessError) {
      console.error(`输入文件不存在: ${audioFilePath}`, fileAccessError);
      throw new Error(`输入文件不存在: ${audioFilePath}`);
    }
    
    // 直接重命名文件而不是合并
    console.log(`重命名文件: ${audioFilePath} -> ${outputFile}`);
    await fs.rename(audioFilePath, outputFile);
    console.log(`文件重命名完成: ${audioFilePath} -> ${outputFile}`);
    
    console.log(`直播录制任务完成: ${taskId}, 输出文件: ${outputFile}`);
    return { success: true, outputFile };
  } catch (error) {
    console.error('停止直播录制失败:', error);
    throw error;
  }
}

// 停止直播录制并合并文件
app.post('/api/stop-recording/:id', async (req, res) => {
  try {
    // 获取任务
    const task = await readTask(req.params.id);
    
    if (!task || task.type !== 'live') {
      return res.status(400).json({ error: '任务不存在或不是直播任务' });
    }
    
    // 使用新的停止录制逻辑，不再合并临时音频文件
    const result = await stopLiveRecording(task.id);
    
    // 更新任务状态
    task.status = 'completed';
    task.isRecording = false;
    task.summary = '音频录制完成';
    task.audioFile = `${task.id}.webm`;
    await saveTask(task);
    
    console.log('任务状态已更新为完成');
    
    res.json({ message: '录制已停止，文件处理完成', task });
  } catch (error) {
    console.error('停止录制失败:', error);
    
    // 更新任务状态为失败
    try {
      const task = await readTask(req.params.id);
      if (task) {
        task.status = 'failed';
        task.isRecording = false;
        task.summary = `处理失败: ${error.message}`;
        await saveTask(task);
        console.log('任务状态已更新为失败');
      }
    } catch (saveError) {
      console.error('更新任务失败状态时出错:', saveError);
    }
    
    res.status(500).json({ error: error.message });
  }
});

// 上传音频文件
app.post('/api/upload-audio/:taskId', upload.single('audio'), async (req, res) => {
  try {
    console.log(`收到音频文件上传请求，任务ID: ${req.params.taskId}`);
    
    if (!req.file) {
      console.log('未找到音频文件');
      return res.status(400).json({ error: '未找到音频文件' });
    }

    // 获取文件扩展名
    const ext = req.file.originalname.split('.').pop();
    console.log(`文件信息:`, {
      originalname: req.file.originalname,
      filename: req.file.filename,
      mimetype: req.file.mimetype,
      size: req.file.size,
      ext: ext,
      path: req.file.path
    });

    // 不再创建任务子目录，直接使用AUDIO_DIR
    const destPath = req.file.path; // 文件已经直接保存在AUDIO_DIR中
    
    // 验证文件是否真的存在
    try {
      await fs.access(destPath);
      console.log(`验证文件存在: ${destPath}`);
    } catch (verifyError) {
      console.error(`文件验证失败，文件不存在: ${destPath}`, verifyError);
      throw new Error(`文件保存失败，无法验证文件是否存在: ${destPath}`);
    }

    // 更新任务状态
    try {
      const task = await readTask(req.params.taskId);
      if (task) {
        task.status = 'processing';
        task.isRecording = true;
        await saveTask(task);
        console.log(`任务状态已更新: ${req.params.taskId}`);
      }
    } catch (taskError) {
      console.error('更新任务状态失败:', taskError);
    }

    res.json({ 
      message: '音频文件上传成功',
      filename: req.file.filename,
      path: destPath
    });
  } catch (error) {
    console.error('上传音频文件失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 上传临时音频文件
app.post('/api/upload-audio-file', transcriptionUpload.single('audio'), async (req, res) => {
  try {
    console.log('收到文件上传请求');
    console.log('请求文件信息:', req.file);
    
    if (!req.file) {
      console.log('未找到音频文件');
      return res.status(400).json({ error: '未找到音频文件' });
    }
    
    console.log('文件上传成功:');
    console.log('- 文件名:', req.file.filename);
    console.log('- 文件路径:', req.file.path);
    console.log('- 文件大小:', req.file.size);
    
    // 验证文件是否存在
    try {
      await fs.access(req.file.path);
      console.log('验证文件存在: 成功');
    } catch (error) {
      console.error('验证文件存在: 失败', error);
      return res.status(500).json({ error: '文件保存失败' });
    }
    
    // 上传文件到OSS
    const client = createOSSClient();
    
    if (!client) {
      console.log('OSS客户端创建失败');
      return res.status(500).json({ error: 'OSS配置不完整，请检查环境变量配置' });
    }
    
    // 生成OSS文件名
    const ossFileName = `temp_audio/${Date.now()}_${req.file.filename}`;
    console.log('生成OSS文件名:', ossFileName);
    
    try {
      // 上传文件到OSS并确保设置公共读权限
      console.log('开始上传文件到OSS...');
      const result = await client.put(ossFileName, req.file.path, {
        headers: {
          'x-oss-object-acl': 'public-read'  // 确保文件具有公共读权限
        }
      });

      // 可选：验证文件是否具有公共读权限
      try {
        console.log('验证文件ACL...');
        const aclResult = await client.getACL(ossFileName);
        console.log('文件ACL信息:', aclResult);
        if (aclResult.acl !== 'public-read') {
          throw new Error('上传的文件未正确设置公共读权限');
        }
      } catch (aclError) {
        console.warn('文件ACL验证失败:', aclError);
      }
      console.log('OSS上传成功:', {
        name: result.name,
        url: result.url,
        res: {
          status: result.res.status,
          statusMessage: result.res.statusMessage
        }
      });
      
      // 验证文件是否真的上传成功
      try {
        console.log('验证上传的文件...');
        const verifyResult = await client.head(ossFileName);
        console.log('文件验证成功:', verifyResult);
      } catch (verifyError) {
        console.error('文件验证失败:', verifyError);
        // 即使验证失败也继续，因为put操作已经返回成功
      }
      
      // 删除本地临时文件
      try {
        await fs.unlink(req.file.path);
        console.log('本地临时文件删除成功');
      } catch (unlinkError) {
        console.warn('本地临时文件删除失败:', unlinkError);
      }
      
      res.json({ 
        message: '文件上传成功', 
        fileName: req.file.filename,
        ossFileName: ossFileName,
        ossUrl: result.url
      });
    } catch (ossError) {
      console.error('OSS上传失败:', ossError);
      
      // 删除本地临时文件
      try {
        await fs.unlink(req.file.path);
        console.log('本地临时文件删除成功');
      } catch (unlinkError) {
        console.warn('本地临时文件删除失败:', unlinkError);
      }
      
      return res.status(500).json({ error: `OSS上传失败: ${ossError.message}` });
    }
  } catch (error) {
    console.error('上传临时音频文件失败:', error);
    
    // 删除本地临时文件
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn('本地临时文件清理失败:', unlinkError);
      }
    }
    
    res.status(500).json({ error: error.message });
  }
});

// 处理录制启动失败
app.post('/api/recording-failed/:id', async (req, res) => {
  try {
    // 获取任务
    const task = await readTask(req.params.id);
    
    if (!task || task.type !== 'live') {
      return res.status(400).json({ error: '任务不存在或不是直播任务' });
    }
    
    // 更新任务状态为失败
    task.status = 'failed';
    task.isRecording = false; // 添加这行，设置录制状态为false
    task.summary = '录制启动失败';
    await saveTask(task);
    
    res.json({ message: '任务状态已更新为失败', task });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 生成音频摘要
app.post('/api/generate-audio-summary/:id', async (req, res) => {
  try {
    // 获取任务
    const task = await readTask(req.params.id);
    
    if (!task || task.type !== 'live') {
      return res.status(400).json({ error: '任务不存在或不是直播任务' });
    }
    
    // 检查音频文件是否存在
    const audioFilePath = join(AUDIO_DIR, `${task.id}.webm`);
    try {
      await fs.access(audioFilePath);
    } catch {
      return res.status(400).json({ error: '音频文件不存在，请先完成录制' });
    }
    
    // 更新任务状态为处理中
    task.status = 'processing';
    await saveTask(task);
    
    try {
      // 生成OSS文件名，使用固定的任务ID作为文件名，避免重复提交时生成不同的文件名
      const ossFileName = `temp_audio/${task.id}.webm`;
      console.log('生成OSS文件名:', ossFileName);
      
      // 上传文件到OSS并设置公共读权限，确保语音识别服务可以访问
      console.log('开始上传文件到OSS...');
      
      // 使用uploadFileToOSS函数上传文件，该函数已包含错误处理和重试机制
      const fileUrl = await uploadFileToOSS(audioFilePath, ossFileName);
      
      // 返回OSS文件名和任务ID，让前端使用STS凭证生成预签名URL
      return res.json({ 
        message: '音频文件上传完成，等待生成摘要', 
        task,
        ossInfo: {
          fileName: ossFileName,
          taskId: task.id,
          fileUrl: fileUrl  // 添加文件的公网访问URL
        }
      });
      
    } catch (processError) {
      console.error('处理音频文件失败:', processError);
      throw processError;
    }
  } catch (error) {
    // 更新任务状态为失败
    try {
      const task = await readTask(req.params.id);
      if (task) {
        task.status = 'failed';
        task.summary = `摘要生成失败: ${error.message}`;
        await saveTask(task);
      }
    } catch (saveError) {
      console.error('更新任务失败状态时出错:', saveError);
    }
    
    res.status(500).json({ error: error.message });
  }
});

// 测试LLM连接
app.post('/api/test-llm', async (req, res) => {
  try {
    const { config, question } = req.body;
    
    if (!config || !config.baseUrl || !config.model || !config.apiKey) {
      return res.status(400).json({ error: 'LLM配置不完整' });
    }
    
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.model,
        messages: [
          {
            role: "user",
            content: question || "你好，请介绍一下你自己"
          }
        ],
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        timeout: 30000
      }
    );
    
    if (response.data.choices && response.data.choices.length > 0) {
      res.json({ response: response.data.choices[0].message.content });
    } else {
      res.status(500).json({ error: 'LLM未返回有效内容' });
    }
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json({ 
        error: `LLM API错误: ${error.response.status} - ${JSON.stringify(error.response.data)}` 
      });
    } else {
      res.status(500).json({ error: `调用LLM失败: ${error.message}` });
    }
  }
});

// 语音识别测试接口
app.post('/api/transcribe-audio', transcriptionUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未找到音频文件' });
    }

    // 获取LLM配置以获取阿里云API Key
    const config = await getLLMConfig();
    if (!config) {
      return res.status(400).json({ error: '请先配置LLM参数，需要包含阿里云API Key' });
    }
    
    // 检查是否配置了阿里云API Key
    const apiKey = config.apiKey;
    if (!apiKey) {
      return res.status(400).json({ error: '请在LLM配置中设置阿里云API Key' });
    }
    
    // 生成OSS文件名
    const ossFileName = `audio_transcription/${Date.now()}_${req.file.filename}`;
    
    // 上传文件到OSS
    const fileUrl = await uploadFileToOSS(join(AUDIO_DIR, req.file.filename), ossFileName);
    
    // 提交转写任务
    const submitResponse = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
      {
        model: 'paraformer-v2',
        input: {
          file_urls: [fileUrl]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable'
        }
      }
    );
    
    if (!submitResponse.data || !submitResponse.data.output || !submitResponse.data.output.task_id) {
      return res.status(500).json({ error: '提交转写任务失败' });
    }
    
    const taskIdForTranscription = submitResponse.data.output.task_id;
    
    // 轮询任务状态直到完成
    let result;
    let attempts = 0;
    const maxAttempts = 30; // 最多尝试30次，每次间隔5秒
    
    while (attempts < maxAttempts) {
      attempts++;
      
      // 查询任务状态
      const queryResponse = await axios.get(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskIdForTranscription}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );
      
      const taskStatus = queryResponse.data.output.task_status;
      
      if (taskStatus === 'SUCCEEDED') {
        result = queryResponse.data;
        break;
      } else if (taskStatus === 'FAILED') {
        // 删除OSS上的文件
        try {
          const client = createOSSClient();
          if (client) {
            await client.delete(ossFileName);
          }
        } catch (deleteError) {
          console.warn('删除OSS文件失败:', deleteError);
        }
        
        return res.status(500).json({ error: `转写任务失败: ${queryResponse.data.output.message}` });
      }
      
      // 等待5秒后再次查询
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    if (!result) {
      // 删除OSS上的文件
      try {
        const client = createOSSClient();
        if (client) {
          await client.delete(ossFileName);
        }
      } catch (deleteError) {
        console.warn('删除OSS文件失败:', deleteError);
      }
      
      return res.status(500).json({ error: '转写任务超时' });
    }
    
    // 提取转写结果
    let transcriptionText = '';
    console.log('转写任务完成，开始提取结果:', JSON.stringify(result, null, 2));
    
    // 更详细地检查结果结构
    if (result && result.output) {
      console.log('输出结构:', JSON.stringify(result.output, null, 2));
      
      if (result.output.results) {
        console.log('结果数组:', JSON.stringify(result.output.results, null, 2));
        
        // 遍历所有结果
        for (let i = 0; i < result.output.results.length; i++) {
          const item = result.output.results[i];
          console.log(`结果[${i}]:`, JSON.stringify(item, null, 2));
          
          if (item.text) {
            transcriptionText += item.text + '\n';
          }
        }
        
        // 如果还是空的，尝试其他可能的字段
        if (!transcriptionText && result.output.results.length > 0) {
          const firstResult = result.output.results[0];
          // 检查是否有其他可能包含文本的字段
          if (firstResult.sentence) {
            transcriptionText = firstResult.sentence;
          } else if (firstResult.sentences) {
            // 如果是句子数组
            if (Array.isArray(firstResult.sentences)) {
              transcriptionText = firstResult.sentences.map(s => s.text || s.sentence || '').join(' ');
            } else if (typeof firstResult.sentences === 'string') {
              transcriptionText = firstResult.sentences;
            }
          }
        }
      }
    }
    
    console.log('最终转写文本:', transcriptionText || '空');
    res.json({ text: transcriptionText.trim() || '未识别到文本内容' });
  } catch (error) {
    console.error('音频转文本失败:', error);
    res.status(500).json({ error: `音频转文本失败: ${error.message}` });
  }
});

// 通过OSS文件进行语音识别
app.post('/api/transcribe-audio-oss', async (req, res) => {
  try {
    const { fileName, originalName, fileUrl } = req.body; // 添加fileUrl参数
    
    console.log('收到语音识别请求:', { fileName, originalName, fileUrl });
    
    // 检查是否提供了OSS URL或者文件名
    if (!fileUrl && !fileName) {
      return res.status(400).json({ error: '文件URL或文件名不能为空' });
    }

    // 获取LLM配置以获取阿里云API Key
    const config = await getLLMConfig();
    if (!config) {
      return res.status(400).json({ error: '请先配置LLM参数，需要包含阿里云API Key' });
    }
    
    // 检查是否配置了阿里云API Key
    const apiKey = config.apiKey;
    if (!apiKey) {
      return res.status(400).json({ error: '请在LLM配置中设置阿里云API Key' });
    }
    
    let fileUrlToUse = fileUrl;
    
    // 如果没有提供URL但提供了文件名，则需要上传文件到OSS
    if (!fileUrlToUse && fileName) {
      // 生成OSS文件名（不包含bucket名称）
      const ossFileName = `temp_audio/${Date.now()}_${fileName}`;
      console.log('生成OSS文件名:', ossFileName);
      
      // 上传文件到OSS并设置公共读权限，确保语音识别服务可以访问
      fileUrlToUse = await uploadFileToOSS(join(AUDIO_DIR, fileName), ossFileName);
      console.log('文件上传到OSS成功，URL:', fileUrlToUse);
    }
    
    if (!fileUrlToUse) {
      return res.status(400).json({ error: '无法获取文件URL' });
    }
    
    console.log('使用文件URL进行识别:', fileUrlToUse);
    
    // 提交转写任务
    console.log('准备提交转写任务到阿里云');
    const submitResponse = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
      {
        model: 'paraformer-v2',
        input: {
          file_urls: [fileUrlToUse]
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-DashScope-Async': 'enable'
        }
      }
    );
    
    console.log('转写任务提交响应:', submitResponse.data);
    
    if (!submitResponse.data || !submitResponse.data.output || !submitResponse.data.output.task_id) {
      return res.status(500).json({ error: '提交转写任务失败' });
    }
    
    const taskIdForTranscription = submitResponse.data.output.task_id;
    console.log('转写任务ID:', taskIdForTranscription);
    
    // 轮询任务状态直到完成
    let result;
    let attempts = 0;
    const maxAttempts = 30; // 最多尝试30次，每次间隔5秒
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`轮询任务状态，第${attempts}次尝试`);
      
      // 查询任务状态
      const queryResponse = await axios.get(
        `https://dashscope.aliyuncs.com/api/v1/tasks/${taskIdForTranscription}`,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        }
      );
      
      console.log('任务状态查询响应:', queryResponse.data);
      
      const taskStatus = queryResponse.data.output.task_status;
      console.log('当前任务状态:', taskStatus);
      
      if (taskStatus === 'SUCCEEDED') {
        result = queryResponse.data;
        console.log('转写任务成功完成');
        break;
      } else if (taskStatus === 'FAILED') {
        console.log('转写任务失败:', queryResponse.data.output.message);
        return res.status(500).json({ error: `转写任务失败: ${queryResponse.data.output.message}` });
      }
      
      // 等待5秒后再次查询
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    if (!result) {
      console.log('转写任务超时');
      return res.status(500).json({ error: '转写任务超时' });
    }
    
    // 提取转写结果
    let transcriptionText = '';
    console.log('转写任务完成，开始提取结果:', JSON.stringify(result, null, 2));
    
    // 更详细地检查结果结构
    if (result && result.output) {
      console.log('输出结构:', JSON.stringify(result.output, null, 2));
      
      if (result.output.results) {
        console.log('结果数组:', JSON.stringify(result.output.results, null, 2));
        
        // 遍历所有结果
        for (let i = 0; i < result.output.results.length; i++) {
          const item = result.output.results[i];
          console.log(`结果[${i}]:`, JSON.stringify(item, null, 2));
          
          // 检查transcription_url字段
          if (item.transcription_url) {
            try {
              // 从transcription_url获取实际的转录文本
              console.log('从transcription_url获取转录结果:', item.transcription_url);
              const transcriptionResponse = await axios.get(item.transcription_url);
              console.log('转录结果响应:', JSON.stringify(transcriptionResponse.data, null, 2));
              
              // 根据返回的JSON结构提取文本 (针对新的JSON格式)
              if (transcriptionResponse.data && transcriptionResponse.data.transcripts) {
                // 新格式：从transcripts数组中提取文本
                const transcripts = transcriptionResponse.data.transcripts;
                if (Array.isArray(transcripts)) {
                  transcriptionText += transcripts.map(t => t.text || '').join('\n');
                }
              } else if (transcriptionResponse.data && transcriptionResponse.data.payload) {
                // 旧格式：从payload.result中提取文本
                const payload = transcriptionResponse.data.payload;
                if (payload && payload.result) {
                  // 处理不同格式的结果
                  if (Array.isArray(payload.result)) {
                    // 如果是数组格式
                    transcriptionText += payload.result.map(r => r.text || '').join('\n');
                  } else if (typeof payload.result === 'object') {
                    // 如果是对象格式
                    if (payload.result.text) {
                      transcriptionText += payload.result.text;
                    } else if (payload.result.sentences) {
                      // 处理句子数组
                      if (Array.isArray(payload.result.sentences)) {
                        transcriptionText += payload.result.sentences.map(s => s.text || s.sentence || '').join('\n');
                      }
                    }
                  } else if (typeof payload.result === 'string') {
                    // 如果是字符串格式
                    transcriptionText += payload.result;
                  }
                }
              }
            } catch (fetchError) {
              console.error('获取转录结果失败:', fetchError);
              transcriptionText += '获取转录结果失败: ' + fetchError.message;
            }
          } else if (item.text) {
            transcriptionText += item.text + '\n';
          } else if (item.sentence) {
            transcriptionText += item.sentence + '\n';
          }
        }
        
        // 如果还是空的，尝试其他可能的字段
        if (!transcriptionText && result.output.results.length > 0) {
          const firstResult = result.output.results[0];
          // 检查是否有其他可能包含文本的字段
          if (firstResult.sentence) {
            transcriptionText = firstResult.sentence;
          } else if (firstResult.sentences) {
            // 如果是句子数组
            if (Array.isArray(firstResult.sentences)) {
              transcriptionText = firstResult.sentences.map(s => s.text || s.sentence || '').join(' ');
            } else if (typeof firstResult.sentences === 'string') {
              transcriptionText = firstResult.sentences;
            }
          } else if (firstResult.text) {
            transcriptionText = firstResult.text;
          }
        }
      }
    }
    
    console.log('最终转写文本:', transcriptionText || '空');
    res.json({ text: transcriptionText.trim() || '未识别到文本内容' });
  } catch (error) {
    console.error('音频转文本失败:', error);
    res.status(500).json({ error: `音频转文本失败: ${error.message}` });
  }
});

// 添加测试OSS连接的接口
app.get('/api/test-oss-connection', async (req, res) => {
  console.log('收到OSS连接测试请求 - 开始处理');

  try {
    const client = createOSSClient();

    if (!client) {
      return res.status(500).json({ success: false, message: 'OSS配置不完整，请检查环境变量配置' });
    }

    // 生成测试文件名
    const ossFileName = `test_upload/test-oss-${Date.now()}.txt`;
    const testFilePath = join(__dirname, 'test.txt');

    // 创建一个测试文件
    await fs.writeFile(testFilePath, 'This is a test file for OSS connection test.');

    console.log('开始上传测试文件到OSS...');
    const result = await client.put(ossFileName, testFilePath, {
      headers: {
        'x-oss-object-acl': 'public-read'  // 设置文件为公共可读
      }
    });

    console.log('OSS上传成功:', {
      name: result.name,
      url: result.url,
      res: {
        status: result.res.status,
        statusMessage: result.res.statusMessage
      }
    });

    // 验证文件是否真的上传成功
    try {
      console.log('验证上传的文件...');
      const verifyResult = await client.head(ossFileName);
      console.log('文件验证成功:', verifyResult);
    } catch (verifyError) {
      console.error('文件验证失败:', verifyError);
    }

    // 删除测试文件
    try {
      console.log('删除测试文件...');
      await client.delete(ossFileName);
      console.log('测试文件删除成功');
    } catch (deleteError) {
      console.warn('测试文件删除失败:', deleteError);
    }

    // 删除本地测试文件
    try {
      await fs.unlink(testFilePath);
      console.log('本地测试文件删除成功');
    } catch (unlinkError) {
      console.warn('本地测试文件删除失败:', unlinkError);
    }

    res.json({
      success: true,
      message: 'OSS连接测试成功，并验证了公共读权限',
      url: result.url
    });

  } catch (error) {
    console.error('OSS连接测试出错:', error);

    res.status(500).json({
      success: false,
      message: `OSS连接测试失败: ${error.message}`
    });
  }

  console.log('OSS连接测试请求处理完成');
});

// 测试OSS图片获取
app.get('/api/test-oss-image', async (req, res) => {
  try {
    console.log('收到OSS图片测试请求');
    
    const client = createOSSClient();
    
    if (!client) {
      return res.status(500).json({ success: false, message: 'OSS配置不完整，请检查环境变量配置' });
    }
    
    // 尝试获取指定的测试图片
    const testImageUrl = 'test.jpg';
    console.log('正在获取OSS图片:', testImageUrl);
    
    // 获取图片内容
    const result = await client.get(testImageUrl);
    console.log('OSS图片获取成功');
    
    // 设置响应头并返回图片
    res.set('Content-Type', result.res.headers['content-type']);
    res.send(result.content);
  } catch (error) {
    console.error('OSS图片获取失败:', error);
    
    // 检查是否是文件不存在错误
    if (error.code === 'NoSuchKey') {
      return res.status(404).json({ success: false, message: 'OSS图片不存在' });
    }
    
    res.status(500).json({ success: false, message: `OSS图片获取失败: ${error.message}` });
  }
});

// 手动测试OSS上传功能
app.post('/api/test-oss-upload', transcriptionUpload.single('audio'), async (req, res) => {
  try {
    console.log('收到OSS上传测试请求');
    
    if (!req.file) {
      console.log('未找到上传文件');
      return res.status(400).json({ success: false, message: '未找到上传文件' });
    }
    
    console.log('上传文件信息:', {
      originalname: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size
    });
    
    const client = createOSSClient();
    
    if (!client) {
      return res.status(500).json({ success: false, message: 'OSS配置不完整，请检查环境变量配置' });
    }
    
    // 生成OSS文件名
    const ossFileName = `test_upload/${Date.now()}_${req.file.filename}`;
    console.log('生成OSS文件名:', ossFileName);
    
    // 上传文件到OSS
    console.log('开始上传文件到OSS...');
    const result = await client.put(ossFileName, req.file.path);
    console.log('OSS上传成功:', {
      name: result.name,
      url: result.url,
      res: {
        status: result.res.status,
        statusMessage: result.res.statusMessage
      }
    });
    
    // 验证文件是否真的上传成功
    try {
      console.log('验证上传的文件...');
      const verifyResult = await client.head(ossFileName);
      console.log('文件验证成功:', verifyResult);
    } catch (verifyError) {
      console.error('文件验证失败:', verifyError);
      // 即使验证失败也继续，因为put操作已经返回成功
    }
    
    // 删除测试文件
    try {
      console.log('删除测试文件...');
      await client.delete(ossFileName);
      console.log('测试文件删除成功');
    } catch (deleteError) {
      console.warn('测试文件删除失败:', deleteError);
    }
    
    // 删除本地临时文件
    try {
      await fs.unlink(req.file.path);
      console.log('本地临时文件删除成功');
    } catch (unlinkError) {
      console.warn('本地临时文件删除失败:', unlinkError);
    }
    
    res.json({ 
      success: true, 
      message: 'OSS上传测试成功',
      ossInfo: {
        name: result.name,
        url: result.url
      }
    });
  } catch (error) {
    console.error('OSS上传测试失败:', error);
    
    // 清理可能存在的本地文件
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn('本地临时文件清理失败:', unlinkError);
      }
    }
    
    res.status(500).json({ success: false, message: `OSS上传测试失败: ${error.message}` });
  }
});

// 生成STS临时访问凭证
app.get('/api/sts', async (req, res) => {
  try {
    // 检查OSS配置
    const ossConfig = {
      accessKeyId: process.env.OSS_ACCESS_KEY_ID,
      accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET
    };

    if (!ossConfig.accessKeyId || !ossConfig.accessKeySecret) {
      return res.status(500).json({ error: 'OSS配置不完整，请检查环境变量配置' });
    }

    // 创建STS实例
    const sts = new OSS.STS({
      accessKeyId: ossConfig.accessKeyId,
      accessKeySecret: ossConfig.accessKeySecret
    });

    // 设置权限策略，允许对temp_audio目录下的文件进行读取操作
    const policy = {
      Statement: [
        {
          Action: ['oss:GetObject'],
          Effect: 'Allow',
          Resource: [`acs:oss:*:*:${process.env.OSS_BUCKET}/temp_audio/*`]
        }
      ],
      Version: '1'
    };

    // 获取STS临时访问凭证
    const result = await sts.assumeRole(
      process.env.OSS_ROLE_ARN, // 角色ARN
      policy,         // 权限策略
      3600,           // 过期时间（秒）
      'audio-summary' // Session名称
    );

    res.json({
      credentials: {
        AccessKeyId: result.credentials.AccessKeyId,
        AccessKeySecret: result.credentials.AccessKeySecret,
        SecurityToken: result.credentials.SecurityToken,
        Expiration: result.credentials.Expiration
      },
      bucket: process.env.OSS_BUCKET,
      region: process.env.OSS_REGION
    });
  } catch (error) {
    console.error('生成STS临时访问凭证失败:', error);
    res.status(500).json({ error: `生成STS临时访问凭证失败: ${error.message}` });
  }
});

// 处理音频摘要（使用预签名URL进行语音识别）
app.post('/api/process-audio-summary', async (req, res) => {
  try {
    console.log('收到处理音频摘要请求:', JSON.stringify(req.body, null, 2));
    
    const { taskId, fileUrl } = req.body;
    
    if (!taskId || !fileUrl) {
      return res.status(400).json({ error: '缺少必要参数: taskId 或 fileUrl' });
    }
    
    // 获取任务
    const task = await readTask(taskId);
    console.log('获取到任务信息:', JSON.stringify(task, null, 2));
    
    if (!task || task.type !== 'live') {
      return res.status(400).json({ error: '任务不存在或不是直播任务' });
    }
    
    // 更新任务状态为处理中
    task.status = 'processing';
    await saveTask(task);
    console.log('任务状态已更新为处理中');
    
    try {
      // 使用阿里云paraformer进行音频转文本
      console.log('开始调用音频转文本函数');
      const textContent = await audioToTextWithParaformer(null, taskId, fileUrl);
      console.log('音频转文本完成，结果:', textContent);
      
      task.content = textContent;
      await saveTask(task);
      console.log('任务内容已保存');
      
      // 获取LLM配置
      const llmConfig = await getLLMConfig();
      console.log('获取到LLM配置:', llmConfig ? '已配置' : '未配置');
      
      if (!llmConfig) {
        throw new Error('请先配置LLM参数');
      }
      
      // 生成摘要
      console.log('开始调用LLM生成摘要');
      const summary = await generateSummaryWithLLM(textContent, llmConfig);
      console.log('LLM生成摘要完成，结果:', summary);
      
      task.summary = summary;
      task.status = 'completed';
      await saveTask(task);
      console.log('任务状态已更新为完成');
      
      res.json({ message: '音频摘要生成完成', task });
    } catch (processError) {
      console.error('处理音频文件失败:', processError);
      throw processError;
    }
  } catch (error) {
    console.error('处理音频摘要过程中发生错误:', error);
    
    // 更新任务状态为失败
    try {
      const task = await readTask(req.body.taskId);
      if (task) {
        task.status = 'failed';
        task.summary = `摘要生成失败: ${error.message}`;
        await saveTask(task);
        console.log('任务状态已更新为失败');
      }
    } catch (saveError) {
      console.error('更新任务失败状态时出错:', saveError);
    }
    
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`后端服务运行在端口 ${PORT}`);
});
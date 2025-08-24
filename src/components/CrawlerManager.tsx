import React, { useState, useEffect, useRef } from 'react';
import { Button, Table, Modal, Form, Input, Select, Space, Tag, message, Upload, Card, List, Dropdown, Menu } from 'antd';
import { PlusOutlined, DeleteOutlined, EyeOutlined, EyeInvisibleOutlined, SettingOutlined, PlayCircleOutlined, StopOutlined, AudioOutlined, FileTextOutlined, SoundOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd/es/upload/interface';
import taskStorage from '../utils/taskStorage';
import type { CrawlerTask, LLMConfig } from '../types';
import TaskStorage from '../utils/taskStorage';
import { LLMStorage } from '../utils/llmStorage';
import ReactMarkdown from 'react-markdown';
import LLMConfigModal from './LLMConfigModal';
import TestCenterModal from './TestCenterModal';

// 添加OSS和STS相关类型定义
interface StsCredentials {
  AccessKeyId: string;
  AccessKeySecret: string;
  SecurityToken: string;
  Expiration: string;
}

interface StsResponse {
  credentials: StsCredentials;
  bucket: string;
  region: string;
}

const llmStorage = new LLMStorage();

const CrawlerManager: React.FC = () => {
  const [tasks, setTasks] = useState<CrawlerTask[]>([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isLLMConfigModalVisible, setIsLLMConfigModalVisible] = useState(false);
  const [isTestCenterModalVisible, setIsTestCenterModalVisible] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LLMConfig | undefined>(undefined);
  const [processingTasks, setProcessingTasks] = useState<Record<string, boolean>>({});
  const [form] = Form.useForm();
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [contentExpanded, setContentExpanded] = useState<Record<string, boolean>>({});
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const currentTaskIdRef = useRef<string | null>(null);
  
  // 语音识别测试相关状态
  const [selectedAudioFile, setSelectedAudioFile] = useState<File | null>(null);
  const [transcriptionResult, setTranscriptionResult] = useState<string>('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isFileUploaded, setIsFileUploaded] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFileUrl, setUploadedFileUrl] = useState(''); 
  
  // 新增：直接输入OSS链接进行语音识别的状态
  const [isDirectTranscribeModalVisible, setIsDirectTranscribeModalVisible] = useState(false);
  const [directAudioUrl, setDirectAudioUrl] = useState('');
  const [directTranscriptionResult, setDirectTranscriptionResult] = useState('');
  const [isDirectTranscribing, setIsDirectTranscribing] = useState(false);

  // 监听selectedAudioFile状态变化，用于调试
  useEffect(() => {
    console.log('selectedAudioFile changed:', selectedAudioFile);
  }, [selectedAudioFile]);
  
  useEffect(() => {
    console.log('All audio test states changed:', {
      selectedAudioFile: !!selectedAudioFile,
      isUploading,
      isFileUploaded,
      isTranscribing
    });
  }, [selectedAudioFile, isUploading, isFileUploaded, isTranscribing]);

  // 添加事件监听器以自动展开任务行
  useEffect(() => {
    const handleExpandTaskRow = (event: CustomEvent) => {
      const { taskId } = event.detail;
      setExpandedRowKeys(prev => {
        if (!prev.includes(taskId)) {
          return [...prev, taskId];
        }
        return prev;
      });
    };

    // 添加事件监听器
    window.addEventListener('expandTaskRow', handleExpandTaskRow as EventListener);
    
    // 清理事件监听器
    return () => {
      window.removeEventListener('expandTaskRow', handleExpandTaskRow as EventListener);
    };
  }, []);

  // 初始化时加载任务数据和LLM配置
  useEffect(() => {
    loadTasks();
    loadLLMConfig();
  }, []);

  const loadTasks = async () => {
    try {
      // 从storage目录加载任务数据
      const loadedTasks = await taskStorage.getAllTasks();
      setTasks(loadedTasks);
    } catch (error) {
      message.error('加载任务数据失败');
    }
  };

  const loadLLMConfig = async () => {
    try {
      const config = await llmStorage.getConfig();
      setLlmConfig(config ?? undefined);
    } catch (error) {
      message.error('加载LLM配置失败');
    }
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const showLLMConfigModal = () => {
    setIsLLMConfigModalVisible(true);
  };

  const showTestCenterModal = () => {
    setIsTestCenterModalVisible(true);
  };

  const handleOk = () => {
    form.validateFields().then(async (values: { name: string; type: 'webpage' | 'video' | 'live'; url: string }) => {
      const newTask: CrawlerTask = {
        id: Math.random().toString(36).substr(2, 9),
        name: values.name,
        type: values.type,
        url: values.url,
        status: 'pending'
      };

      setTasks([...tasks, newTask]);
      
      // 保存任务到文件
      try {
        await taskStorage.saveTask(newTask);
        message.success('任务创建成功');
      } catch (error) {
        message.error('任务保存失败');
      }
      
      form.resetFields();
      setIsModalVisible(false);
    });
  };

  const handleLLMConfigOk = async (config: LLMConfig) => {
    try {
      await llmStorage.saveConfig(config);
      setLlmConfig(config);
      setIsLLMConfigModalVisible(false);
      message.success('LLM配置保存成功');
    } catch (error) {
      message.error('LLM配置保存失败');
    }
  };

  const handleCancel = () => {
    form.resetFields();
    setIsModalVisible(false);
  };

  const handleLLMConfigCancel = () => {
    setIsLLMConfigModalVisible(false);
  };

  const showAudioTestModal = () => {
    setIsTestCenterModalVisible(true);
  };

  const handleAudioTestCancel = () => {
    setIsTestCenterModalVisible(false);
    // 重置状态
    setSelectedAudioFile(null);
    setTranscriptionResult('');
    setIsTranscribing(false);
    setIsUploading(false);
    setIsFileUploaded(false);
    setUploadedFileName('');
    setUploadedFileUrl('');
  };
  
  // 新增：处理直接语音识别测试取消
  const handleDirectTranscribeCancel = () => {
    setIsDirectTranscribeModalVisible(false);
    setDirectAudioUrl('');
    setDirectTranscriptionResult('');
    setIsDirectTranscribing(false);
  };

  const handleAudioFileChange: UploadProps['onChange'] = ({ file, fileList }) => {
    console.log('File change event:', file, fileList);
    if (file.status === 'removed') {
      console.log('File removed');
      setSelectedAudioFile(null);
      setIsFileUploaded(false);
      setUploadedFileName('');
      setIsUploading(false);
      setIsTranscribing(false);
      // 如果有文件正在上传或识别，取消它们
      if (isUploading) {
        message.info('文件上传已取消');
      }
      if (isTranscribing) {
        message.info('语音识别已取消');
      }
    } else if (file.originFileObj) {
      console.log('File selected:', file.originFileObj);
      setSelectedAudioFile(file.originFileObj);
      // 确保重置所有状态
      setIsFileUploaded(false);
      setUploadedFileName('');
      setIsUploading(false);
      setIsTranscribing(false);
    } else if (fileList && fileList.length > 0) {
      // 处理可能的其他情况
      const lastFile = fileList[fileList.length - 1];
      if (lastFile.originFileObj) {
        console.log('Last file in list:', lastFile.originFileObj);
        setSelectedAudioFile(lastFile.originFileObj);
        // 确保重置所有状态
        setIsFileUploaded(false);
        setUploadedFileName('');
        setIsUploading(false);
        setIsTranscribing(false);
      }
    }
  };

  const handleUploadAndTranscribe = async () => {
    if (!selectedAudioFile) {
      message.warning('请先选择一个音频文件');
      return;
    }

    setIsUploading(true);

    try {
      // 上传文件到服务器
      const formData = new FormData();
      formData.append('audio', selectedAudioFile);

      const response = await fetch('http://localhost:3001/api/upload-audio-file', {
        method: 'POST',
        body: formData
      });

      console.log('Upload response status:', response.status);
      console.log('Upload response headers:', [...response.headers.entries()]);

      const responseText = await response.text();
      console.log('Upload response text:', responseText);

      if (!response.ok) {
        let errorData;
        try {
          errorData = JSON.parse(responseText);
        } catch (parseError) {
          console.log('Failed to parse error response as JSON:', parseError);
          errorData = { error: responseText };
        }
        
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.log('Failed to parse success response as JSON:', parseError);
        throw new Error('服务器返回了无效的响应格式');
      }
      
      console.log('Upload success response:', result);
      
      // 检查返回结果是否包含必要的字段
      if (!result.fileName || !result.ossUrl) {
        throw new Error('服务器返回结果缺少必要字段');
      }
      
      setUploadedFileName(result.fileName);
      setUploadedFileUrl(result.ossUrl); // 保存OSS URL
      setIsFileUploaded(true);
      message.success('文件上传成功，请复制OSS链接用于语音识别');
    } catch (error) {
      console.error('Upload failed with error:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      message.error(`文件上传失败: ${errorMessage}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleTranscribe = async () => {
    if (!uploadedFileUrl) {
      message.warning('请先上传文件获取OSS链接');
      return;
    }

    setIsTranscribing(true);
    setTranscriptionResult('');

    try {
      // 调用语音识别服务
      const response = await fetch('http://localhost:3001/api/transcribe-audio-oss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileUrl: uploadedFileUrl // 直接使用已上传的OSS文件URL
        })
      });

      console.log('Transcribe response status:', response.status);
      console.log('Transcribe response headers:', [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Transcribe error response text:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (parseError) {
          console.log('Failed to parse transcribe error response as JSON:', parseError);
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Transcribe success response:', result);
      
      // 更详细地处理结果
      let displayText = '未识别到文本内容';
      if (result.text !== undefined && result.text !== null) {
        if (typeof result.text === 'string' && result.text.trim() !== '') {
          displayText = result.text;
        } else if (typeof result.text === 'string' && result.text.trim() === '') {
          displayText = '识别完成，但未检测到语音内容';
        }
      }
      
      setTranscriptionResult(displayText);
      message.success('语音识别完成');
    } catch (error) {
      console.error('Transcribe failed with error:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      message.error(`语音识别失败: ${errorMessage}`);
      setTranscriptionResult(`识别失败: ${errorMessage}`);
    } finally {
      setIsTranscribing(false);
    }
  };
  
  // 新增：处理直接语音识别
  const handleDirectTranscribe = async () => {
    if (!directAudioUrl) {
      message.warning('请输入音频文件链接');
      return;
    }

    setIsDirectTranscribing(true);
    setDirectTranscriptionResult('');

    try {
      // 调用语音识别服务
      const response = await fetch('http://localhost:3001/api/transcribe-audio-oss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fileUrl: directAudioUrl
        })
      });

      console.log('Direct transcribe response status:', response.status);
      console.log('Direct transcribe response headers:', [...response.headers.entries()]);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Direct transcribe error response text:', errorText);
        
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (parseError) {
          console.log('Failed to parse direct transcribe error response as JSON:', parseError);
          errorData = { error: errorText };
        }
        
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('Direct transcribe success response:', result);
      
      setDirectTranscriptionResult(result.text || '未识别到文本内容');
      message.success('语音识别完成');
    } catch (error) {
      console.error('Direct transcribe failed with error:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      message.error(`语音识别失败: ${errorMessage}`);
      setDirectTranscriptionResult(`识别失败: ${errorMessage}`);
    } finally {
      setIsDirectTranscribing(false);
    }
  };

  const handleDelete = async (id: string) => {
    setTasks(tasks.filter((task) => task.id !== id));
    setExpandedRowKeys(expandedRowKeys.filter((key) => key !== id));
    
    // 从文件系统中删除任务
    try {
      await taskStorage.deleteTask(id);
      message.success('任务删除成功');
    } catch (error) {
      message.error('任务删除失败');
    }
  };

  const handleGenerateSummary = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) {
      console.error('找不到任务:', id);
      return;
    }

    console.log(`开始生成任务${id}的摘要, 类型: ${task.type}`);
    // 设置任务为处理中状态
    setProcessingTasks(prev => ({ ...prev, [id]: true }));
    
    try {
      if (task.type === 'webpage') {
        console.log('开始处理网页任务:', id);
        // 处理网页任务
        await taskStorage.processWebPageTask(id);
        message.success('任务处理完成');
      } else if (task.type === 'live') {
        console.log('开始生成直播音频摘要:', id);
        // 生成音频摘要
        await taskStorage.generateAudioSummary(id);
        message.success('开始生成音频摘要');
      } else {
        console.warn('不支持的摘要类型:', task.type);
        message.warning('该任务类型不支持生成摘要');
        return;
      }
      
      // 重新加载任务列表
      await loadTasks();
      
      // 自动展开摘要内容
      setExpandedRowKeys(prev => {
        if (!prev.includes(id)) {
          return [...prev, id];
        }
        return prev;
      });
    } catch (error) {
      console.error('生成摘要失败:', error);
      // 重新加载任务列表以更新失败状态
      await loadTasks();
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      message.error(`生成摘要失败: ${errorMessage}`);
    } finally {
      console.log(`完成任务${id}的摘要生成`);
      setProcessingTasks(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleOpenLivePage = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    // 在新标签页中打开直播链接
    const newWindow = window.open(task.url, '_blank', 'noopener,noreferrer');
    if (newWindow) {
      newWindow.opener = null;
    }
    
    message.success('已在新标签页中打开直播页面，请在该页面播放内容');
  };

  const handleStartRecording = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) {
      console.error('找不到任务:', id);
      message.error('找不到指定的任务');
      return;
    }

    console.log(`开始启动任务${id}的录制, 类型: ${task.type}`);
    // 设置任务为处理中状态
    setProcessingTasks(prev => ({ ...prev, [id]: true }));
    
    try {
      if (task.type === 'live') {
        console.log('开始浏览器录制:', id);
        // 直接开始浏览器音频录制，不打开新页面
        await startBrowserRecording(id);
        
        console.log('调用storage开始直播录制:', id);
        // 开始直播录制
        await taskStorage.startLiveRecording(id);
        message.success('已开始录制直播音频');
        
        // 重新加载任务列表
        await loadTasks();
      } else {
        console.warn('不支持的录制类型:', task.type);
        message.warning('该任务类型不支持录制');
        setProcessingTasks(prev => ({ ...prev, [id]: false }));
        return;
      }
    } catch (error) {
      console.error('启动录制失败:', error);
      // 重新加载任务列表以更新失败状态
      await loadTasks();
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      message.error(`开始录制失败: ${errorMessage}`);
    } finally {
      // 只有在不是真正开始录制时才设置为false，如果已经开始录制则保持loading状态
      // 实际的loading状态会在录制停止时通过loadTasks更新
      try {
        const updatedTasks = await taskStorage.getAllTasks();
        const updatedTask = updatedTasks.find(t => t.id === id);
        if (!updatedTask || !updatedTask.isRecording) {
          setProcessingTasks(prev => ({ ...prev, [id]: false }));
        }
      } catch (updateError) {
        console.error('更新任务处理状态失败:', updateError);
        setProcessingTasks(prev => ({ ...prev, [id]: false }));
      }
    }
  };

  const startBrowserRecording = async (taskId: string) => {
    try {
      message.info('请在弹出的窗口中选择刚才打开的直播页面标签，并确保勾选"分享音频"选项。如果未看到直播页面，请检查浏览器是否已打开新标签页。');
      
      console.log('开始请求屏幕和音频捕获权限');
      
      // 请求屏幕和音频捕获权限
      console.log('请求getDisplayMedia权限');
      const stream = await navigator.mediaDevices.getDisplayMedia({ 
        video: true, 
        audio: true 
      });
      
      console.log('成功获取媒体流', stream);
      
      // 检查流是否包含音轨
      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      
      console.log('音频轨道数量:', audioTracks.length);
      console.log('视频轨道数量:', videoTracks.length);
      
      if (audioTracks.length === 0) {
        message.warning('警告：未检测到音频轨道，请确保在屏幕共享时选择了"分享音频"选项');
      }
      
      // 尝试多种方式创建MediaRecorder
      console.log('尝试创建MediaRecorder实例');
      let mediaRecorder;
      
      // 方法1: 尝试不带任何配置参数创建
      try {
        mediaRecorder = new MediaRecorder(stream);
        console.log('方法1成功: 使用默认配置创建MediaRecorder，状态:', mediaRecorder.state);
      } catch (error1) {
        console.log('方法1失败:', error1);
        
        // 方法2: 尝试使用空的options对象创建
        try {
          mediaRecorder = new MediaRecorder(stream, {});
          console.log('方法2成功: 使用空配置创建MediaRecorder，状态:', mediaRecorder.state);
        } catch (error2) {
          console.log('方法2失败:', error2);
          
          // 方法3: 尝试检测支持的MIME类型并使用
          const mimeTypesToTry = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg;codecs=opus',
            'audio/mp4',
            'audio/mp3'
          ];
          
          let mimeType = '';
          for (const type of mimeTypesToTry) {
            if (MediaRecorder.isTypeSupported(type)) {
              mimeType = type;
              console.log(`检测到支持的MIME类型: ${type}`);
              break;
            }
          }
          
          if (mimeType) {
            try {
              mediaRecorder = new MediaRecorder(stream, { mimeType });
              console.log('方法3成功: 使用检测到的MIME类型创建MediaRecorder，状态:', mediaRecorder.state);
            } catch (error3) {
              console.log('方法3失败:', error3);
              mediaRecorder = null;
            }
          } else {
            mediaRecorder = null;
          }
        }
      }
      
      // 如果所有方法都失败了
      if (!mediaRecorder) {
        throw new Error('无法使用任何方法创建MediaRecorder实例');
      }
      
      console.log('最终使用的MediaRecorder配置:');
      console.log('- MIME类型:', mediaRecorder.mimeType || '默认');
      console.log('- 状态:', mediaRecorder.state);
      
      mediaRecorderRef.current = mediaRecorder;
      currentTaskIdRef.current = taskId;
      audioChunksRef.current = [];
      
      // 监听数据可用事件
      mediaRecorder.ondataavailable = event => {
        console.log('收到数据块，大小:', event.data.size);
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // 监听录制错误事件
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder错误:', event);
        message.error('录制过程中发生错误');
      };
      
      // 监听录制停止事件
      mediaRecorder.onstop = async () => {
        try {
          console.log('录制已停止，数据块数量:', audioChunksRef.current.length);
          
          if (audioChunksRef.current.length === 0) {
            message.warning('未捕获到音频数据，请检查音频源或权限设置');
            // 更新任务状态为失败
            try {
              if (currentTaskIdRef.current) {
                await taskStorage.recordingFailed(currentTaskIdRef.current);
                await loadTasks();
              }
            } catch (e) {
              console.error('更新任务状态失败:', e);
              message.error('更新任务状态失败: ' + (e instanceof Error ? e.message : '未知错误'));
            }
            return;
          }
          
          // 计算总数据大小
          const totalSize = audioChunksRef.current.reduce((acc, chunk) => acc + chunk.size, 0);
          console.log('总音频数据大小:', totalSize, '字节');
          
          // 将音频数据打包成 Blob
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          
          // 上传到后端
          await uploadAudioToServer(audioBlob, taskId);
          message.success('音频录制完成并已上传');
          
          // 延迟一小段时间确保文件完全写入磁盘
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 通知后端停止录制并处理文件
          await taskStorage.stopLiveRecording(taskId);
          
          // 重新加载任务列表以更新状态
          await loadTasks();
          
          // 更新处理状态
          setProcessingTasks(prev => ({ ...prev, [taskId]: false }));
        } catch (error) {
          console.error('录制停止处理失败:', error);
          message.error('音频处理失败: ' + (error instanceof Error ? error.message : '未知错误'));
          setProcessingTasks(prev => ({ ...prev, [taskId]: false }));
          
          // 更新任务状态为失败
          try {
            if (currentTaskIdRef.current) {
              await taskStorage.recordingFailed(currentTaskIdRef.current);
              await loadTasks();
            }
          } catch (e) {
            console.error('更新任务状态失败:', e);
            message.error('更新任务状态失败: ' + (e instanceof Error ? e.message : '未知错误'));
          }
        }
      };
      
      // 开始录制
      console.log('开始录制');
      try {
        // 先检查MediaRecorder状态
        console.log('录制前MediaRecorder状态:', mediaRecorder.state);
        if (mediaRecorder.state === 'inactive') {
          // 尝试不同的时间切片值
          const timeSliceOptions = [1000, 100, 0]; // 1秒, 100毫秒, 立即
          let startSuccess = false;
          
          for (const timeSlice of timeSliceOptions) {
            try {
              if (timeSlice > 0) {
                mediaRecorder.start(timeSlice);
              } else {
                mediaRecorder.start();
              }
              console.log(`使用timeSlice=${timeSlice}启动录制成功，MediaRecorder状态:`, mediaRecorder.state);
              startSuccess = true;
              break;
            } catch (sliceError) {
              console.log(`使用timeSlice=${timeSlice}启动录制失败:`, sliceError);
            }
          }
          
          if (!startSuccess) {
            throw new Error('尝试所有时间切片值都无法启动录制');
          }
        } else {
          throw new Error(`MediaRecorder状态异常: ${mediaRecorder.state}`);
        }
      } catch (startError) {
        console.error('启动MediaRecorder失败:', startError);
        throw new Error(`启动录制失败: ${startError instanceof Error ? startError.message : '未知错误'}`);
      }
      
      // 当用户停止共享屏幕时的处理
      if (videoTracks.length > 0) {
        videoTracks[0].onended = () => {
          console.log('用户停止共享屏幕');
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
          }
        };
      }
      
      message.info('开始录制，请在完成时停止共享屏幕');
    } catch (error) {
      console.error('录制启动失败:', error);
      
      // 检查是否是用户拒绝了权限
      if (error instanceof Error && error.name === 'NotAllowedError') {
        message.error('用户未授权屏幕共享权限，无法开始录制。请确保选择正确的标签页并允许音频共享。');
      } else if (error instanceof Error && error.name === 'NotFoundError') {
        message.error('未找到可共享的媒体内容，请确保已打开要录制的页面。');
      } else if (error instanceof Error && error.name === 'AbortError') {
        message.error('屏幕共享被中断，请重试。');
      } else {
        message.error('无法开始录制: ' + (error instanceof Error ? error.message : '未知错误'));
      }
      
      // 更新任务状态为失败
      try {
        if (currentTaskIdRef.current) {
          await taskStorage.recordingFailed(currentTaskIdRef.current);
          await loadTasks();
        }
      } catch (e) {
        console.error('更新任务状态失败:', e);
        message.error('更新任务状态失败: ' + (e instanceof Error ? e.message : '未知错误'));
      }
      
      // 重新抛出错误以便上层处理
      throw error;
    }
  };

  const uploadAudioToServer = async (audioBlob: Blob, taskId: string) => {
    const formData = new FormData();
    // 直接使用taskId作为文件名，避免临时文件合并逻辑
    formData.append('audio', audioBlob, `${taskId}.webm`);
    
    const response = await fetch(`http://localhost:3001/api/upload-audio/${taskId}`, {
      method: 'POST',
      body: formData
    });
    
    console.log('上传音频到服务器的响应状态:', response.status);
    console.log('上传音频到服务器的响应头:', [...response.headers.entries()]);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('上传音频到服务器失败，响应文本:', errorText);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch (parseError) {
        console.log('无法解析错误响应为JSON:', parseError);
        errorData = { error: errorText };
      }
      
      throw new Error(errorData.error || `HTTP错误! 状态码: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('上传音频到服务器成功，响应数据:', result);
    
    return result;
  };

  const handleStopRecording = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    try {
      if (task.type === 'live') {
        // 停止直播任务
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        
        message.success('已停止录制');
        
        // 重新加载任务列表
        await loadTasks();
      } else {
        message.warning('该任务类型不支持停止录制');
      }
    } catch (error) {
      message.error('停止录制失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setProcessingTasks(prev => ({ ...prev, [id]: false }));
    }
  };

  const toggleExpandRow = (id: string) => {
    if (expandedRowKeys.includes(id)) {
      setExpandedRowKeys(expandedRowKeys.filter((key) => key !== id));
    } else {
      setExpandedRowKeys([...expandedRowKeys, id]);
    }
  };

  const getStatusColor = (status: CrawlerTask['status']) => {
    switch (status) {
      case 'pending': return 'default';
      case 'processing': return 'processing';
      case 'completed': return 'success';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const getStatusText = (status: CrawlerTask['status']) => {
    switch (status) {
      case 'pending': return '待处理';
      case 'processing': return '处理中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      default: return '未知';
    }
  };

  const getTypeText = (type: CrawlerTask['type']) => {
    switch (type) {
      case 'webpage': return '文本网页';
      case 'video': return '视频链接';
      case 'live': return '音视频网页';
      default: return '未知';
    }
  };

  const columns: ColumnsType<CrawlerTask> = [
    {
      title: '任务ID',
      dataIndex: 'id',
      key: 'id',
      width: '15%',
    },
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: '20%',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: '15%',
      render: (type: CrawlerTask['type']) => getTypeText(type),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: '15%',
      render: (status: CrawlerTask['status']) => (
        <Tag color={getStatusColor(status)}>{getStatusText(status)}</Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: '35%',
      render: (_, record) => (
        <Space size="middle" wrap>
          {record.type === 'webpage' && (
            <Button 
              type="text" 
              icon={<FileTextOutlined />}
              onClick={() => handleGenerateSummary(record.id)}
              loading={processingTasks[record.id]}
              disabled={record.status === 'processing'}
              size="small"
            >
              总结
            </Button>
          )}
          {record.type === 'live' && (
            <>
              {record.isRecording ? (
                <Button 
                  type="text" 
                  icon={<StopOutlined />}
                  onClick={() => handleStopRecording(record.id)}
                  danger
                  loading={processingTasks[record.id]}
                  size="small"
                >
                  停止
                </Button>
              ) : (
                <>
                  <Button 
                    type="text" 
                    icon={<PlayCircleOutlined />}
                    onClick={() => handleOpenLivePage(record.id)}
                    size="small"
                  >
                    打开链接
                  </Button>
                  <Button 
                    type="text" 
                    icon={<AudioOutlined />}
                    onClick={() => handleStartRecording(record.id)}
                    loading={processingTasks[record.id]}
                    disabled={record.status === 'processing' && !record.audioFile}
                    size="small"
                  >
                    开始录制
                  </Button>
                </>
              )}
              <Button 
                type="text" 
                icon={<FileTextOutlined />}
                onClick={() => handleGenerateSummary(record.id)}
                loading={processingTasks[record.id]}
                disabled={!record.audioFile}
                size="small"
              >
                生成摘要
              </Button>
            </>
          )}
          <Button 
            type="text" 
            icon={expandedRowKeys.includes(record.id) ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => toggleExpandRow(record.id)}
            size="small"
          >
            {expandedRowKeys.includes(record.id) ? '收起' : '展开'}
          </Button>
          <Button 
            type="text" 
            danger 
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
            size="small"
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const menu = (
    <Menu>
      <Menu.Item key="config" icon={<SettingOutlined />} onClick={showLLMConfigModal}>
        配置中心
      </Menu.Item>
      <Menu.Item key="audioTest" icon={<AudioOutlined />} onClick={showTestCenterModal}>
        测试中心
      </Menu.Item>
      <Menu.Item key="directTranscribe" icon={<AudioOutlined />} onClick={() => setIsDirectTranscribeModalVisible(true)}>
        直接语音识别测试
      </Menu.Item>
    </Menu>
  );

  return (
    <div style={{ padding: '24px', overflowX: 'hidden', maxWidth: '100vw' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <h2>AI内容摘要生成</h2>
        <div>
          <Button 
            icon={<SoundOutlined />} 
            onClick={showTestCenterModal}
            style={{ marginRight: '8px', marginBottom: '8px' }}
          >
            测试中心
          </Button>
          <Button 
            icon={<SettingOutlined />} 
            onClick={showLLMConfigModal}
            style={{ marginRight: '8px', marginBottom: '8px' }}
          >
            配置中心
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={showModal} style={{ marginBottom: '8px' }}>
            创建任务
          </Button>
        </div>
      </div>

      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        pagination={false}
        scroll={{ y: 600 }}
        style={{ overflowX: 'hidden', maxWidth: '100%' }}
        expandable={{
          expandedRowKeys,
          expandedRowRender: record => (
            <div style={{ padding: '16px 8px', backgroundColor: '#fafafa', overflowX: 'hidden', maxWidth: '100%', wordBreak: 'break-word' }}>
              {record.content && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <h3 style={{ margin: 0 }}>原文内容:</h3>
                    <Button 
                      type="link" 
                      onClick={() => {
                        setContentExpanded(prev => ({
                          ...prev,
                          [record.id]: !prev[record.id]
                        }));
                      }}
                      style={{ marginLeft: '8px' }}
                    >
                      {contentExpanded[record.id] ? '收起' : '查看详情'}
                    </Button>
                  </div>
                  {contentExpanded[record.id] && (
                    <div style={{ 
                      backgroundColor: '#f5f5f5', 
                      padding: '12px', 
                      borderRadius: '4px',
                      marginBottom: '16px',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflowX: 'hidden',
                      maxWidth: '100%',
                      boxSizing: 'border-box'
                    }}>
                      {record.content}
                    </div>
                  )}
                </>
              )}
              
              {record.summary ? (
                <>
                  <h3>摘要内容:</h3>
                  <div style={{ 
                    backgroundColor: '#f9f9f9', 
                    padding: '16px', 
                    borderRadius: '4px',
                    border: '1px solid #e8e8e8',
                    overflowX: 'hidden',
                    maxWidth: '100%',
                    boxSizing: 'border-box'
                  }}>
                    <ReactMarkdown
                      components={{
                        h1: ({node, ...props}) => <h1 style={{color: '#000', fontSize: '24px', fontWeight: 'bold', wordBreak: 'break-word'}} {...props} />,
                        h2: ({node, ...props}) => <h2 style={{color: '#000', fontSize: '20px', fontWeight: 'bold', marginTop: '16px', wordBreak: 'break-word'}} {...props} />,
                        h3: ({node, ...props}) => <h3 style={{color: '#000', fontSize: '18px', fontWeight: 'bold', marginTop: '14px', wordBreak: 'break-word'}} {...props} />,
                        p: ({node, ...props}) => <p style={{margin: '8px 0', lineHeight: '1.6', wordBreak: 'break-word'}} {...props} />,
                        ul: ({node, ...props}) => <ul style={{margin: '8px 0', paddingLeft: '20px', wordBreak: 'break-word'}} {...props} />,
                        ol: ({node, ...props}) => <ol style={{margin: '8px 0', paddingLeft: '20px', wordBreak: 'break-word'}} {...props} />,
                        li: ({node, ...props}) => <li style={{margin: '4px 0', wordBreak: 'break-word'}} {...props} />,
                        a: ({node, ...props}) => <a style={{wordBreak: 'break-word', overflowWrap: 'break-word', wordWrap: 'break-word'}} {...props} />,
                      }}
                    >
                      {record.summary.replace(/```|\n``$/g, '').trim()}
                    </ReactMarkdown>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                  {record.status === 'pending' && '请点击相应按钮开始处理任务'}
                  {record.status === 'processing' && '任务处理中...'}
                  {record.status === 'completed' && '暂无摘要内容'}
                  {record.status === 'failed' && '任务处理失败'}
                </div>
              )}
            </div>
          ),
          expandIcon: () => null, // 隐藏默认的展开图标
        }}
      />

      <Modal
        title="创建爬取任务"
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        okText="确认"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="请输入任务名称" />
          </Form.Item>
          
          <Form.Item
            name="type"
            label="任务类型"
            rules={[{ required: true, message: '请选择任务类型' }]}
          >
            <Select placeholder="请选择任务类型">
              <Select.Option value="webpage">文本网页</Select.Option>
              <Select.Option value="live">音视频网页</Select.Option>
            </Select>
          </Form.Item>
          
          <Form.Item
            name="url"
            label="链接地址"
            rules={[
              { required: true, message: '请输入链接地址' },
              { type: 'url', message: '请输入有效的URL' }
            ]}
          >
            <Input placeholder="请输入链接地址" />
          </Form.Item>
        </Form>
      </Modal>

      <LLMConfigModal 
        open={isLLMConfigModalVisible}
        initialConfig={llmConfig ?? undefined}
        onCancel={handleLLMConfigCancel}
        onOk={handleLLMConfigOk}
      />

      <TestCenterModal
        open={isTestCenterModalVisible}
        onCancel={() => setIsTestCenterModalVisible(false)}
      />

      {/* 语音识别测试弹窗 */}
      {/* 已移除重复的Modal组件，使用TestCenterModal组件替代 */}
    </div>
  );
};

export default CrawlerManager;
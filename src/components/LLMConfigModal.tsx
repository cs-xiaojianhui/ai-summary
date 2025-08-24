import React, { useState, useEffect } from 'react';
import type { UploadFile } from 'antd/es/upload/interface';
import { Modal, Form, Input, Button, message, Card, Alert, Tabs, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd/es/upload/interface';

interface LLMConfigModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (config: LLMConfig) => void;
  initialConfig?: LLMConfig;
}

interface LLMConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface OSSConfig {
  region: string;
  access_id: string;
  access_secret: string;
  bucket: string;
}

const LLMConfigModal: React.FC<LLMConfigModalProps> = ({ 
  open, 
  onCancel, 
  onOk,
  initialConfig 
}) => {
  const [llmForm] = Form.useForm();
  const [ossForm] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [testQuestion, setTestQuestion] = useState('你好，请介绍一下你自己');
  const [testResponse, setTestResponse] = useState('');
  const [testError, setTestError] = useState('');
  const [ossConfig, setOssConfig] = useState<OSSConfig | null>(null);
  const [savingOSS, setSavingOSS] = useState(false);
  const [testingOSS, setTestingOSS] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<{url: string, name: string} | null>(null);
  const [savingLLM, setSavingLLM] = useState(false);

  // 添加useEffect来监听selectedFile状态变化
  useEffect(() => {
    console.log('Selected file state updated:', selectedFile);
    if (selectedFile) {
      console.log('Selected file details:', {
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      });
    }
  }, [selectedFile]);

  useEffect(() => {
    if (open) {
      loadOSSConfig();
    }
  }, [open]);

  const loadOSSConfig = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/oss-config');
      if (!response.ok) {
        throw new Error(`获取OSS配置失败: ${response.status} ${response.statusText}`);
      }
      const config = await response.json();
      setOssConfig(config);
      ossForm.setFieldsValue(config);
    } catch (error) {
      console.error('加载OSS配置失败:', error);
    }
  };

  const handleTestConnection = async () => {
    try {
      const values = await llmForm.validateFields();
      setTesting(true);
      setTestResponse('');
      setTestError('');
      
      // 发送测试请求到后端
      const response = await fetch('http://localhost:3001/api/test-llm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          config: values,
          question: testQuestion
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || '测试连接失败');
      }
      
      const answer = data.response;
      
      setTestResponse(answer);
      message.success('连接成功！');
    } catch (error: any) {
      console.error('测试连接失败:', error);
      const errorMessage = error.message || '连接测试失败，请检查配置';
      setTestError(errorMessage);
      message.error(errorMessage);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveLLMConfig = async () => {
    try {
      const values = await llmForm.validateFields();
      setSavingLLM(true);
      
      const response = await fetch('http://localhost:3001/api/llm-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `保存LLM配置失败: ${response.status} ${response.statusText}`);
      }
      
      message.success('LLM配置保存成功！');
    } catch (error: any) {
      console.error('保存LLM配置失败:', error);
      message.error('保存LLM配置失败: ' + (error.message || '未知错误'));
    } finally {
      setSavingLLM(false);
    }
  };

  const handleSaveOSSConfig = async () => {
    try {
      const values = await ossForm.validateFields();
      setSavingOSS(true);
      
      const response = await fetch('http://localhost:3001/api/oss-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `保存OSS配置失败: ${response.status} ${response.statusText}`);
      }
      
      message.success('OSS配置保存成功！');
    } catch (error: any) {
      console.error('保存OSS配置失败:', error);
      message.error('保存OSS配置失败: ' + (error.message || '未知错误'));
    } finally {
      setSavingOSS(false);
    }
  };

  const handleFileChange: UploadProps['onChange'] = ({ file, fileList }) => {
    console.log('File change event triggered:', { file, fileList });
    
    // 最简化处理逻辑 - 直接从fileList获取文件
    if (fileList && fileList.length > 0) {
      const currentFile = fileList[0]; // 只取第一个文件，因为maxCount={1}
      console.log('Current file:', currentFile);
      
      // 检查是否有originFileObj
      if (currentFile.originFileObj) {
        console.log('Setting selected file to originFileObj:', currentFile.originFileObj);
        setSelectedFile(currentFile.originFileObj);
        setUploadResult(null);
        return;
      }
      
      // 如果没有originFileObj，尝试使用file对象本身（某些情况下file可能就是文件对象）
      if (currentFile instanceof File || (currentFile && typeof currentFile === 'object' && currentFile.name && currentFile.size)) {
        console.log('Setting selected file to file object:', currentFile);
        setSelectedFile(currentFile as any as File);
        setUploadResult(null);
        return;
      }
      
      console.log('File object does not appear to be a valid File instance');
    } else {
      console.log('File list is empty, clearing selected file');
      setSelectedFile(null);
      setUploadResult(null);
    }
  };

  const handleTestOSSUpload = async () => {
    console.log('Testing OSS upload, selected file:', selectedFile);
    if (!selectedFile) {
      message.error('请先选择要上传的文件');
      return;
    }

    try {
      const values = await ossForm.validateFields();
      console.log('OSS config values for upload test:', values);
      setTestingOSS(true);
      
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('config', JSON.stringify(values)); // 确保配置参数被正确序列化为字符串

      console.log('Sending request to /api/test-oss-upload-with-config');
      const response = await fetch('http://localhost:3001/api/test-oss-upload-with-config', {
        method: 'POST',
        body: formData,
      });
      
      console.log('Received response from server:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('Upload error response:', errorText);
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch (parseError) {
          throw new Error(`服务器响应错误: ${response.status} ${response.statusText}`);
        }
        throw new Error(errorData.error || `上传失败: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('Received upload result:', result);
      setUploadResult({ url: result.fileUrl, name: result.fileName });
      message.success('文件上传测试成功！');
    } catch (error: any) {
      console.error('上传失败:', error);
      message.error('上传失败: ' + (error.message || '未知错误'));
    } finally {
      setTestingOSS(false);
    }
  };

  const handleOk = async () => {
    try {
      const values = await llmForm.validateFields();
      onOk(values);
    } catch (error) {
      console.error('验证失败:', error);
    }
  };

  const items = [
    {
      key: 'llm',
      label: 'LLM配置',
      children: (
        <Form
          form={llmForm}
          layout="vertical"
          initialValues={initialConfig}
        >
          <Form.Item
            name="baseUrl"
            label="Base URL"
            rules={[{ required: true, message: '请输入Base URL' }]}
          >
            <Input placeholder="例如: https://dashscope.aliyuncs.com/compatible-mode/v1" />
          </Form.Item>
          
          <Form.Item
            name="model"
            label="模型"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <Input placeholder="例如: qwen-plus" />
          </Form.Item>
          
          <Form.Item
            name="apiKey"
            label="API Key"
            rules={[{ required: true, message: '请输入API Key' }]}
          >
            <Input.Password placeholder="请输入API Key" />
          </Form.Item>
          
          <Form.Item>
            <Button 
              type="primary" 
              onClick={handleSaveLLMConfig}
              loading={savingLLM}
              style={{ width: '100%' }}
            >
              {savingLLM ? '保存中...' : '保存配置'}
            </Button>
          </Form.Item>
          
          <Form.Item
            label="测试问题"
          >
            <Input.TextArea 
              value={testQuestion}
              onChange={(e) => setTestQuestion(e.target.value)}
              placeholder="请输入测试问题"
              autoSize={{ minRows: 2, maxRows: 4 }}
            />
          </Form.Item>
          
          <Form.Item>
            <Button 
              type="primary" 
              onClick={handleTestConnection}
              loading={testing}
              style={{ width: '100%' }}
            >
              {testing ? '测试中...' : '测试连接'}
            </Button>
          </Form.Item>
          
          {testError && (
            <Form.Item>
              <Alert message="测试错误" description={testError} type="error" showIcon />
            </Form.Item>
          )}
          
          {testResponse && (
            <Form.Item
              label="测试回答"
            >
              <Card size="small">
                <div style={{ whiteSpace: 'pre-wrap' }}>
                  {testResponse}
                </div>
              </Card>
            </Form.Item>
          )}
        </Form>
      )
    },
    {
      key: 'oss',
      label: 'OSS配置',
      children: (
        <div>
          <Form
            form={ossForm}
            layout="vertical"
          >
            <Form.Item
              name="region"
              label="Region"
              rules={[{ required: true, message: '请输入Region' }]}
            >
              <Input placeholder="例如: oss-cn-hangzhou" />
            </Form.Item>
            
            <Form.Item
              name="access_id"
              label="Access ID"
              rules={[{ required: true, message: '请输入Access ID' }]}
            >
              <Input placeholder="请输入Access ID" />
            </Form.Item>
            
            <Form.Item
              name="access_secret"
              label="Access Secret"
              rules={[{ required: true, message: '请输入Access Secret' }]}
            >
              <Input.Password placeholder="请输入Access Secret" />
            </Form.Item>
            
            <Form.Item
              name="bucket"
              label="Bucket"
              rules={[{ required: true, message: '请输入Bucket' }]}
            >
              <Input placeholder="请输入Bucket" />
            </Form.Item>
            
            <Form.Item>
              <Button 
                type="primary" 
                onClick={handleSaveOSSConfig}
                loading={savingOSS}
                style={{ width: '100%' }}
              >
                {savingOSS ? '保存中...' : '保存配置'}
              </Button>
            </Form.Item>
          </Form>
          
          <Card title="测试OSS上传" size="small" style={{ marginTop: '20px' }}>
            <Upload
              beforeUpload={() => {
                console.log('beforeUpload triggered, preventing upload');
                return false;
              }}
              onChange={(info) => {
                console.log('Upload onChange triggered with info:', info);
                handleFileChange(info);
              }}
              maxCount={1}
            >
              <Button icon={<UploadOutlined />}>选择文件</Button>
            </Upload>
            
            <div style={{ marginTop: '15px' }}>
              <Button 
                type="primary" 
                onClick={handleTestOSSUpload}
                loading={testingOSS}
                disabled={!selectedFile}
                style={{ width: '100%' }}
              >
                {testingOSS ? '测试上传中...' : '测试上传'}
              </Button>
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
              调试信息: selectedFile={selectedFile ? `YES (${selectedFile.name})` : 'NO'}
            </div>
            
            {uploadResult && (
              <div style={{ marginTop: '15px' }}>
                <p>文件上传成功:</p>
                <p><strong>文件名:</strong> {uploadResult.name}</p>
                <p><strong>访问链接:</strong> <a href={uploadResult.url} target="_blank" rel="noopener noreferrer">{uploadResult.url}</a></p>
              </div>
            )}
          </Card>
        </div>
      )
    }
  ];

  return (
    <Modal
      title="配置中心"
      open={open}
      onCancel={onCancel}
      onOk={handleOk}
      width={800}
      footer={null}
    >
      <Tabs items={items} />
    </Modal>
  );
};

export default LLMConfigModal;
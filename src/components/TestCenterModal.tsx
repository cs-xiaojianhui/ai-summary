import React, { useState } from 'react';
import { Modal, Tabs, Input, Button, Card, message, Space } from 'antd';

interface TestCenterModalProps {
  open: boolean;
  onCancel: () => void;
}

const TestCenterModal: React.FC<TestCenterModalProps> = ({ open, onCancel }) => {
  const [directAudioUrl, setDirectAudioUrl] = useState('');
  const [directTranscriptionResult, setDirectTranscriptionResult] = useState('');
  const [isDirectTranscribing, setIsDirectTranscribing] = useState(false);

  const handleDirectTranscribe = async () => {
    if (!directAudioUrl) {
      message.error('请输入音频文件链接');
      return;
    }

    setIsDirectTranscribing(true);
    setDirectTranscriptionResult('');
    try {
      const response = await fetch('http://localhost:3001/api/transcribe-audio-oss', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          fileUrl: directAudioUrl
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `语音识别失败: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log('语音识别成功:', result);
      
      setDirectTranscriptionResult(result.text || '未识别到内容');
      message.success('语音识别测试成功！');
    } catch (error) {
      console.error('语音识别失败:', error);
      message.error('语音识别失败: ' + (error instanceof Error ? error.message : '未知错误'));
      setDirectTranscriptionResult('语音识别失败: ' + (error instanceof Error ? error.message : '未知错误'));
    } finally {
      setIsDirectTranscribing(false);
    }
  };

  const items = [
    {
      key: 'asr',
      label: '语音识别测试',
      children: (
        <Card size="small" style={{ minHeight: '400px' }}>
          <div style={{ padding: '20px' }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>通过链接进行语音识别</h3>
            <Input
              placeholder="请输入OSS音频文件链接"
              value={directAudioUrl}
              onChange={(e) => setDirectAudioUrl(e.target.value)}
              style={{ marginBottom: '10px' }}
            />
            <div style={{ marginBottom: '15px', fontSize: '12px', color: '#999' }}>
              请输入完整的OSS音频文件URL，例如：https://bucket-name.oss-region.aliyuncs.com/path/to/audio.wav
            </div>
            <Space>
              <Button 
                onClick={handleDirectTranscribe}
                loading={isDirectTranscribing}
                disabled={!directAudioUrl}
              >
                开始识别
              </Button>
            </Space>
            
            {directTranscriptionResult ? (
              <div style={{ 
                minHeight: '100px', 
                backgroundColor: '#f5f5f5', 
                padding: '12px', 
                borderRadius: '4px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                marginTop: '20px'
              }}>
                {directTranscriptionResult}
              </div>
            ) : isDirectTranscribing ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <p>正在进行语音识别...</p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
                识别结果将显示在这里
              </div>
            )}
          </div>
        </Card>
      )
    }
  ];

  return (
    <Modal
      title="测试中心"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={800}
    >
      <Tabs items={items} />
    </Modal>
  );
};

export default TestCenterModal;
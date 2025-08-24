# AI 内容摘要生成系统

AI Summary 是一个基于人工智能的内容摘要生成系统，支持网页内容抓取和音频处理功能。该系统通过集成大型语言模型（LLM）来生成高质量的内容摘要。

## 功能特性

- **网页内容抓取与摘要**：输入网页链接，自动抓取内容并生成结构化摘要
- **音频处理**：支持音频文件的存储和语音识别处理
- **LLM集成**：可配置多种大型语言模型（如通义千问等）进行内容摘要生成
- **可视化管理界面**：基于React和Ant Design的用户友好的前端界面
- **任务管理**：创建、查看、处理和删除各种类型的任务
- **OSS存储支持**：支持将音频文件上传到阿里云OSS进行存储
- **语音识别**：支持对音频文件进行语音识别处理
- **配置中心**：集中管理LLM和OSS配置
- **测试中心**：提供各项功能的测试能力

## 技术架构

### 前端技术栈
- React 18.3.1
- Ant Design 5.18.0
- TypeScript 5.4.5
- Vite 5.2.12

### 后端技术栈
- Node.js Express 4.19.2
- Axios 1.7.2
- Ali-oss 6.23.0 (用于OSS存储)

### 项目结构
```
ai-summary/
├── src/                 # 前端源代码
│   ├── components/      # React组件
│   ├── types/           # TypeScript类型定义
│   ├── utils/           # 工具类
│   ├── App.tsx          # 主应用组件
│   └── main.tsx         # 应用入口
├── config/              # 配置文件
├── storage/             # 任务数据存储目录
├── audio/               # 音频文件存储目录 (运行时创建)
├── server.js            # 后端服务
├── package.json         # 项目依赖和脚本
└── vite.config.ts       # Vite配置
```

## 安装与运行

### 环境要求
- Node.js >= 18
- 可访问的LLM API (如通义千问等)
- 阿里云OSS账户(用于音频文件存储)

### 安装步骤
```bash
# 克隆项目
git clone <项目地址>
cd ai-summary

# 安装依赖
npm install
```

### 运行项目
```bash
# 同时启动前端和后端服务
npm start

# 或者分别启动
npm run dev     # 启动前端 (端口3003)
npm run server  # 启动后端服务 (端口3001)
```

访问 http://localhost:3003 查看应用界面。

### 构建项目
```bash
# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

## 使用指南

### 1. 配置中心
首次使用需要配置相关参数：

**LLM配置**：
1. 点击界面右上角的"LLM配置"按钮
2. 填写Base URL、模型名称和API Key
3. 可以通过测试按钮验证配置是否正确
4. 支持保存配置以便后续使用

**OSS配置**：
1. 在配置中心选择OSS配置标签页
2. 填写Region、Access ID、Access Secret和Bucket信息
3. 可以通过测试上传功能验证配置是否正确

### 2. 创建任务
支持创建三种类型的任务：
- **网页任务**：输入网页URL，系统会抓取内容并生成摘要
- **视频链接任务**：视频链接管理（待实现）
- **直播链接任务**：输入直播流URL，系统会录制音频

### 3. 处理任务
- 对于网页任务，点击"总结"按钮开始处理
- 对于直播任务，点击"开始录制"按钮开始录制音频

### 4. 测试中心
系统提供测试中心功能，用于验证各项配置：
- **语音识别测试**：输入OSS音频文件链接，测试语音识别功能
- 可用于验证OSS配置和语音识别服务是否正常工作

### 5. 查看结果
- 展开任务行可以查看网页内容和生成的摘要
- 摘要以Markdown格式展示，包含主要内容、关键信息点和总结

## API接口

后端服务运行在 `http://localhost:3001`，提供以下API接口：

### 任务管理
- `GET /api/tasks` - 获取所有任务
- `GET /api/tasks/:id` - 获取指定任务
- `POST /api/tasks` - 创建任务
- `PUT /api/tasks/:id` - 更新任务
- `DELETE /api/tasks/:id` - 删除任务

### LLM配置
- `GET /api/llm-config` - 获取LLM配置
- `POST /api/llm-config` - 保存LLM配置

### OSS配置
- `GET /api/oss-config` - 获取OSS配置
- `POST /api/oss-config` - 保存OSS配置

### 任务处理
- `POST /api/process-webpage/:id` - 处理网页任务
- `POST /api/process-live/:id` - 处理直播任务
- `POST /api/stop-live/:id` - 停止直播录制
- `POST /api/test-llm` - 测试LLM连接

### 音频处理
- `POST /api/test-oss-upload` - 测试OSS上传
- `POST /api/test-oss-upload-with-config` - 使用指定配置测试OSS上传
- `POST /api/transcribe-audio-oss` - 对OSS中的音频文件进行语音识别

## 数据存储

- 任务数据存储在 `storage/` 目录下，每个任务以JSON文件形式保存
- 音频文件存储在 `audio/` 目录下（运行时自动创建）
- LLM配置存储在 `config/llmConfig.json` 文件中
- OSS配置存储在 `config/ossConfig.json` 文件中

## 注意事项

1. 需要可访问的LLM API服务来生成摘要
2. 网页抓取可能受到目标网站反爬虫策略的限制
3. 项目默认使用3001端口提供后端服务，3003端口提供前端界面
4. 使用OSS功能需要有效的阿里云OSS账户和相应权限
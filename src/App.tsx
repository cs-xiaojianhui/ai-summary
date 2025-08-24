import React from 'react';
import { ConfigProvider, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import CrawlerManager from './components/CrawlerManager';
import 'antd/dist/reset.css';

const App: React.FC = () => {
  return (
    <ConfigProvider locale={zhCN}>
      <AntApp>
        <CrawlerManager />
      </AntApp>
    </ConfigProvider>
  );
};

export default App;
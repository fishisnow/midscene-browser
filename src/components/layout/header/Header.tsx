import React from 'react';
import { SettingOutlined, GithubOutlined } from '@ant-design/icons';

interface HeaderProps {
  onSettingsClick?: () => void;
}

const Header: React.FC<HeaderProps> = ({ onSettingsClick }) => {
  return (
    <div className="header-nav">
      <div className="logo-container">
        <img src="/icons/Midscene.png" alt="Logo" className="midscene-logo" />
        <span className="logo-text">Midscene</span>
      </div>
      
      <div className="header-actions">
        <a 
          href="https://github.com/midscene/midscene" 
          target="_blank" 
          rel="noopener noreferrer"
          className="github-button"
        >
          <GithubOutlined />
        </a>
        
        {onSettingsClick && (
          <div className="settings-button" onClick={onSettingsClick}>
            <SettingOutlined />
          </div>
        )}
      </div>
    </div>
  );
};

export default Header; 
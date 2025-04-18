import React from 'react';
import { Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ExecuteButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export const ExecuteButton: React.FC<ExecuteButtonProps> = ({
  onClick, 
  loading = false, 
  disabled = false,
  className = 'execute-button'
}) => {
  return (
    <Button
      className={className}
      onClick={onClick}
      type="primary"
      shape="circle"
      icon={<SendOutlined className="execute-button-icon" style={{ fontSize: '15px', marginLeft: '2px' }} />}
      loading={loading}
      disabled={disabled}
      htmlType="button"
      style={{ 
        width: '32px', 
        height: '32px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
      }}
    />
  );
};
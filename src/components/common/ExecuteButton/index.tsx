import React from 'react';
import { Button } from 'antd';
import { SendOutlined } from '@ant-design/icons';

interface ExecuteButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

const ExecuteButton: React.FC<ExecuteButtonProps> = ({ 
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
      icon={<SendOutlined className="execute-button-icon" />}
      loading={loading}
      disabled={disabled}
      htmlType="button"
    />
  );
};

export default ExecuteButton; 
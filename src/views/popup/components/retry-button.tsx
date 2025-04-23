import React from 'react';
import { Button } from 'antd';
import { RedoOutlined } from '@ant-design/icons';

interface RetryButtonProps {
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
  text?: string;
  className?: string;
}

export const RetryButton: React.FC<RetryButtonProps> = ({
  onClick, 
  loading = false,
  disabled = false,
  text = '重试',
  className = 'retry-button'
}) => {
  return (
    <Button 
      className={className}
      onClick={onClick} 
      icon={<RedoOutlined className="retry-icon" />}
      loading={loading}
      disabled={disabled}
    >
      {text}
    </Button>
  );
};
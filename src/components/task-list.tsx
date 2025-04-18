import { Card, List, Tooltip, Progress, Alert, Button } from 'antd';
import { CheckCircleOutlined, InfoCircleOutlined, LoadingOutlined, ThunderboltOutlined, CloseCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { ActivityItem } from './composite-agent';
import '../styles/components.css';

// 添加任务状态枚举
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface TaskWithStatus extends ActivityItem {
  isCompleted: boolean;
  executionTime?: number; // 执行时间（毫秒）
  status?: TaskStatus; // 任务状态
  startTime?: number | null; // 开始执行时间
  error?: string | null; // 错误信息
  result?: any; // 任务执行结果
}

interface TaskListProps {
  tasks: TaskWithStatus[];
  currentTaskIndex: number;
  loading?: boolean;
  error?: Error;
  onRetry?: () => void;
  showTaskStatus?: boolean; // 是否显示任务状态
}

export const TaskList: React.FC<TaskListProps> = ({ 
  loading, 
  tasks, 
  error, 
  onRetry,
  currentTaskIndex,
  showTaskStatus = false
}) => {
  const completedTasks = tasks.filter(t => t.isCompleted || t.status === TaskStatus.COMPLETED);
  const currentTask = tasks[currentTaskIndex] || tasks.find(t => t.status === TaskStatus.RUNNING);
  const pendingTasks = tasks.filter(t => t.status === TaskStatus.PENDING);
  const failedTasks = tasks.filter(t => t.status === TaskStatus.FAILED);
  const showPlanningPhase = loading && tasks.length === 0;

  return (
    <Card 
      className={`task-list-card ${showPlanningPhase ? 'task-planning-phase' : ''}`}
      title={
        <div className="task-list-header">
          <div className="task-header-title">
            {loading && tasks.length === 0 ? (
              <>
                <ThunderboltOutlined /> 规划执行步骤
              </>
            ) : (
              <>
                任务列表 
                <span className="task-count">{completedTasks.length}/{tasks.length}</span>
                {showTaskStatus && tasks.length > 0 && (
                  <span className="task-status-indicators">
                    {pendingTasks.length > 0 && (
                      <span className="status-badge pending">待执行: {pendingTasks.length}</span>
                    )}
                    {currentTask && currentTask.status === TaskStatus.RUNNING && (
                      <span className="status-badge running">执行中: 1</span>
                    )}
                    {failedTasks.length > 0 && (
                      <span className="status-badge failed">失败: {failedTasks.length}</span>
                    )}
                  </span>
                )}
              </>
            )}
          </div>
          {error && <Button size="small" onClick={onRetry}>重试</Button>}
        </div>
      }
    >
      {error && (
        <Alert 
          type="error" 
          message="执行错误" 
          description={
            <div className="error-description">
              {error.message || '执行过程中出现了错误，请重试或修改您的指令。'}
            </div>
          }
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {showPlanningPhase && (
        <>
          <div className="planning-info">
            <InfoCircleOutlined style={{ marginRight: 8 }} />
            AI 正在规划具体的执行步骤...
          </div>
          <div className="task-planning-animation">
            <div className="task-planning-dot"></div>
            <div className="task-planning-dot"></div>
            <div className="task-planning-dot"></div>
          </div>
          <div className="task-planning-text planning">
            正在分析任务并生成执行计划，请稍候...
          </div>
        </>
      )}

      {tasks.length > 0 && (
        <>
          <Progress 
            percent={tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0}
            status={error ? 'exception' : (loading ? 'active' : completedTasks.length === tasks.length ? 'success' : 'normal')}
            strokeColor={loading && tasks.length > 0 && !error ? '#1890ff' : undefined}
            style={{ marginBottom: 16 }}
          />
          
          <Tooltip title={loading ? '正在执行任务中...' : (error ? '执行出错' : '所有任务已完成')}>
            <div className="task-status">
              {loading ? (
                <div>
                  <LoadingOutlined style={{ marginRight: 8 }} />
                  {currentTask ? `正在执行: ${currentTask.activity_prompt}` : '处理中...'}
                </div>
              ) : (
                <div>
                  {error ? (
                    <CloseCircleOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />
                  ) : (
                    <CheckCircleOutlined style={{ color: '#52c41a', marginRight: 8 }} />
                  )}
                  {error ? '执行出错' : (tasks.length > 0 ? '所有任务已完成' : '暂无任务')}
                </div>
              )}
            </div>
          </Tooltip>

          <List
            dataSource={tasks}
            renderItem={(task, index) => {
              const isCurrentTask = index === currentTaskIndex;
              const isCompleted = task.isCompleted || task.status === TaskStatus.COMPLETED;
              const isFailed = task.status === TaskStatus.FAILED;
              
              let statusClass = '';
              if (isCompleted) statusClass = 'completed';
              else if (isFailed) statusClass = 'failed';
              else if (isCurrentTask) statusClass = 'running';
              else statusClass = 'pending';
              
              return (
                <div key={index} className={`task-item ${statusClass}`}>
                  <div className="task-header">
                    <div className={`task-icon ${statusClass}`}>
                      {isFailed && <CloseCircleOutlined />}
                      {isCompleted && <CheckCircleOutlined />}
                      {isCurrentTask && !isCompleted && !isFailed && (
                        <div className="loading-dots">
                          <div className="dot"></div>
                          <div className="dot"></div>
                          <div className="dot"></div>
                        </div>
                      )}
                      {!isCurrentTask && !isCompleted && !isFailed && <ClockCircleOutlined />}
                    </div>
                    <div className="task-name">
                      任务 {index + 1}
                    </div>
                    <div className={`task-status-label ${statusClass}`}>
                      {isFailed && '失败'}
                      {isCompleted && '已完成'}
                      {isCurrentTask && !isCompleted && !isFailed && '执行中'}
                      {!isCurrentTask && !isCompleted && !isFailed && '待执行'}
                    </div>
                  </div>
                  {task.activity_prompt && (
                    <div className="task-description">
                      {task.activity_prompt}
                    </div>
                  )}
                  {isCompleted && task.result !== undefined && (
                    <div className="task-result">
                      <div className="result-header">执行结果:</div>
                      <div className="result-content">
                        {typeof task.result === 'object' ? JSON.stringify(task.result, null, 2) : task.result}
                      </div>
                    </div>
                  )}
                  {isFailed && task.error && (
                    <div className="task-error">
                      {task.error}
                    </div>
                  )}
                </div>
              );
            }}
          />
        </>
      )}
    </Card>
  );
}; 
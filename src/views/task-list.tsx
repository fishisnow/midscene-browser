import {Card, List, Tooltip, Progress, Alert, Button} from 'antd';
import {
    CheckCircleOutlined,
    LoadingOutlined,
    ThunderboltOutlined,
    CloseCircleOutlined,
    ClockCircleOutlined
} from '@ant-design/icons';
import {ActivityItem} from '../agent/composite-agent.ts';
import {RetryButton} from './popup/components/retry-button.tsx';
// 导入i18n
import { useTranslation } from 'react-i18next';

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
    onReturn?: () => void;
}

export const TaskList: React.FC<TaskListProps> = ({
                                                      loading,
                                                      tasks,
                                                      error,
                                                      onRetry,
                                                      currentTaskIndex,
                                                      showTaskStatus = false
                                                  }) => {
    const { t } = useTranslation();
    const completedTasks = tasks.filter(t => t.isCompleted || t.status === TaskStatus.COMPLETED);
    const currentTask = tasks[currentTaskIndex] || tasks.find(t => t.status === TaskStatus.RUNNING);
    const pendingTasks = tasks.filter(t => !t.isCompleted && t.status === TaskStatus.PENDING);
    const failedTasks = tasks.filter(t => t.status === TaskStatus.FAILED);
    const hasError = error || failedTasks.length > 0;

    return (
        <Card
            className={`task-list-card`}
            title={
                <div className="task-list-header">
                    <div className="task-header-title">
                        {loading && tasks.length === 0 ? (
                            <>
                                <ThunderboltOutlined/> {t('playground.taskPlanning')}
                            </>
                        ) : (
                            <>
                                {t('tasks.taskList')}
                                <span className="task-count">{completedTasks.length}/{tasks.length}</span>
                                {showTaskStatus && tasks.length > 0 && (
                                    <span className="task-status-indicators">
                    {pendingTasks.length > 0 && (
                        <span className="status-badge pending">{t('tasks.pending')}: {pendingTasks.length}</span>
                    )}
                                        {currentTask && currentTask.status === TaskStatus.RUNNING && (
                                            <span className="status-badge running">{t('tasks.running')}: 1</span>
                                        )}
                                        {failedTasks.length > 0 && (
                                            <span className="status-badge failed">{t('tasks.failed')}: {failedTasks.length}</span>
                                        )}
                  </span>
                                )}
                            </>
                        )}
                    </div>
                    {error && <Button size="small" onClick={onRetry}>{t('common.retry')}</Button>}
                </div>
            }
        >
            {error && (
                <Alert
                    type="error"
                    message={t('tasks.executionError')}
                    description={
                        <div className="error-description">
                            {error.message || t('errors.executionError')}
                        </div>
                    }
                    showIcon
                    style={{marginBottom: 16}}
                    action={onRetry ? <RetryButton onClick={onRetry}/> : null}
                />
            )}

            {tasks.length > 0 && (
                <>
                    <Progress
                        percent={tasks.length ? Math.round((completedTasks.length / tasks.length) * 100) : 0}
                        status={error ? 'exception' : (loading ? 'active' : completedTasks.length === tasks.length ? 'success' : 'normal')}
                        strokeColor={loading && tasks.length > 0 && !error ? '#1890ff' : undefined}
                        style={{marginBottom: 16}}
                    />

                    <Tooltip title={loading ? t('tasks.processing') : (hasError ? t('tasks.executionError') : t('tasks.allTasksCompleted'))}>
                        <div className="task-status">
                            {loading ? (
                                <div>
                                    <LoadingOutlined style={{marginRight: 8}}/>
                                    {currentTask ? `${t('tasks.running')}: ${currentTask.activity_prompt}` : t('tasks.processing')}
                                </div>
                            ) : (
                                <div>
                                    {hasError ? (
                                        <CloseCircleOutlined style={{color: '#ff4d4f', marginRight: 8}}/>
                                    ) : (
                                        <CheckCircleOutlined style={{color: '#52c41a', marginRight: 8}}/>
                                    )}
                                    {hasError ? t('tasks.executionError') : (tasks.length > 0 ? t('tasks.allTasksCompleted') : t('tasks.noTasks'))}
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
                                            {isFailed && <CloseCircleOutlined/>}
                                            {isCompleted && <CheckCircleOutlined/>}
                                            {isCurrentTask && !isCompleted && !isFailed && (
                                                <div className="loading-dots">
                                                    <div className="dot"></div>
                                                    <div className="dot"></div>
                                                    <div className="dot"></div>
                                                </div>
                                            )}
                                            {!isCurrentTask && !isCompleted && !isFailed && <ClockCircleOutlined/>}
                                        </div>
                                        <div className="task-name">
                                            {t('tasks.task')} {index + 1}
                                        </div>
                                        <div className={`task-status-label ${statusClass}`}>
                                            {isFailed && t('tasks.failed')}
                                            {isCompleted && t('tasks.completed')}
                                            {isCurrentTask && !isCompleted && !isFailed && t('tasks.running')}
                                            {!isCurrentTask && !isCompleted && !isFailed && t('tasks.pending')}
                                        </div>
                                    </div>
                                    {task.activity_prompt && (
                                        <div className="task-description">
                                            {task.activity_prompt}
                                        </div>
                                    )}
                                    {isCompleted && task.result !== undefined && (
                                        <div className="task-result">
                                            <div className="result-header">{t('tasks.executionResult')}</div>
                                            <div className="result-content">
                                                {typeof task.result === 'object'
                                                    ? JSON.stringify(task.result, null, 2)
                                                    : typeof task.result === 'string' && task.result.includes('\n')
                                                        ? task.result
                                                        : task.result
                                                }
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
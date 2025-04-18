import type { UIContext } from '@midscene/core';
import { overrideAIConfig } from '@midscene/core/env';
import {
  ContextPreview,
  EnvConfig,
  type PlaygroundResult,
  PlaygroundResultView,
  type ReplayScriptsInfo,
  useEnvConfig,
} from '@midscene/visualizer';
import { allScriptsFromDump } from '@midscene/visualizer';
import { Form, message, Button, Progress, Modal, Tooltip } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CompositeAgent, TaskPlan } from './composite-agent';
import { PromptInput } from './prompt-input';
import { TaskList, TaskWithStatus, TaskStatus } from './task-list';
import { KnowledgeCarousel } from './knowledge-carousel';

export interface PlaygroundProps {
  getAgent: (forceSameTabNavigation?: boolean) => any | null;
  showContextPreview?: boolean;
  dryMode?: boolean;
}

const ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED = 'NOT_IMPLEMENTED_AS_DESIGNED';

const formatErrorMessage = (e: any): string => {
  const errorMessage = e?.message || '';
  if (errorMessage.includes('of different extension')) {
    return 'Conflicting extension detected. Please disable the suspicious plugins and refresh the page. Guide: https://midscenejs.com/quick-experience.html#faq';
  }
  if (!errorMessage?.includes(ERROR_CODE_NOT_IMPLEMENTED_AS_DESIGNED)) {
    return errorMessage;
  }
  return 'Unknown error';
};

// Blank result template
const blankResult = {
  result: null,
  dump: null,
  reportHTML: null,
  error: null,
};

// 添加执行阶段状态枚举
enum ExecutionPhase {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  ERROR = 'error'
}

// 添加任务执行统计接口
interface TaskStats {
  total: number;
  completed: number;
  successRate: number;
  averageExecutionTime: number;
  startTime: number | null;
  endTime: number | null;
}

// 设置对话框组件
const SettingsModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  return (
    <Modal
      title="环境配置"
      open={visible}
      onCancel={onClose}
      destroyOnClose={true}
      maskClosable={true}
      centered={true}
      className="settings-modal"
      footer={[
        <Button key="close" type="primary" onClick={onClose}>
          确认
        </Button>
      ]}
      width={700}
    >
      <div className="settings-modal-content">
        <h3>浏览器内请求配置</h3>
        <p className="settings-description">
          这些设置将影响浏览器自动化的行为和性能。请根据需要进行调整。
        </p>
        <EnvConfig />
      </div>
    </Modal>
  );
};

// Browser Extension Playground Component
export function BrowserExtensionPlayground({
  getAgent,
  showContextPreview = true,
  dryMode = false,
}: PlaygroundProps) {
  // State management
  const [uiContextPreview, setUiContextPreview] = useState<
    UIContext | undefined
  >(undefined);
  const [loading, setLoading] = useState(false);
  const [loadingProgressText, setLoadingProgressText] = useState('');
  const [result, setResult] = useState<PlaygroundResult | null>(null);
  const [verticalMode, setVerticalMode] = useState(false);
  const [replayScriptsInfo, setReplayScriptsInfo] =
    useState<ReplayScriptsInfo | null>(null);
  const [replayCounter, setReplayCounter] = useState(0);
  const [currentActivityIndex, setCurrentActivityIndex] = useState(-1);
  const [tasksWithStatus, setTasksWithStatus] = useState<TaskWithStatus[]>([]);
  const [selectedKnowledge, setSelectedKnowledge] = useState<string>('');
  const [advancedKnowledge, setAdvancedKnowledge] = useState<Record<string, string>>({});
  // 新增执行阶段状态
  const [executionPhase, setExecutionPhase] = useState<ExecutionPhase>(ExecutionPhase.IDLE);
  // 添加设置对话框可见性状态
  const [settingsVisible, setSettingsVisible] = useState(false);
  // 存储当前任务计划
  // 添加任务统计数据
  const [taskStats, setTaskStats] = useState<TaskStats>({
    total: 0,
    completed: 0,
    successRate: 0,
    averageExecutionTime: 0,
    startTime: null,
    endTime: null,
  });

  // Form and environment configuration
  const [form] = Form.useForm();

  const { config } = useEnvConfig();
  const forceSameTabNavigation = useEnvConfig(
      (state) => state.forceSameTabNavigation,
  );

  const compositeAgentRef = useRef<CompositeAgent | null>(null);
  const currentRunningIdRef = useRef<number | null>(0);
  const interruptedFlagRef = useRef<Record<number, boolean>>({});

  // Environment configuration check
  const configAlreadySet = Object.keys(config || {}).length >= 1;

  // Responsive layout settings
  useEffect(() => {
    const sizeThreshold = 750;
    setVerticalMode(window.innerWidth < sizeThreshold);

    const handleResize = () => {
      setVerticalMode(window.innerWidth < sizeThreshold);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Override AI configuration
  useEffect(() => {
    overrideAIConfig(config as any);
  }, [config]);

  // Initialize context preview
  useEffect(() => {
    if (uiContextPreview) return;
    if (!showContextPreview) return;

    getAgent(forceSameTabNavigation)
      ?.getUIContext()
      .then((context: UIContext) => {
        setUiContextPreview(context);
      })
      .catch((e: any) => {
        message.error('获取 UI 上下文失败');
        console.error(e);
      });
  }, [uiContextPreview, showContextPreview, getAgent, forceSameTabNavigation]);

  // 处理活动开始事件
  const handleActivityStart = (index: number) => {
    setTasksWithStatus(prevTasks => {
      const newTasks = [...prevTasks];
      if (newTasks[index]) {
        newTasks[index] = {
          ...newTasks[index],
          status: TaskStatus.RUNNING,
          startTime: Date.now()
        };
      }
      return newTasks;
    });
    setCurrentActivityIndex(index);
  };

  // 处理活动完成事件
  const handleActivityComplete = (index: number, executionTime: number) => {
    setTasksWithStatus(prevTasks => {
      const newTasks = [...prevTasks];
      if (newTasks[index]) {
        newTasks[index] = {
          ...newTasks[index],
          isCompleted: true,
          status: TaskStatus.COMPLETED,
          executionTime: executionTime
        };
      }
      // 更新标题显示完成进度
      const completedCount = newTasks.filter(task => task.isCompleted || task.status === TaskStatus.COMPLETED).length;
      document.title = `Web自动化测试 (${completedCount}/${newTasks.length})`;
      
      // 更新任务统计数据
      setTaskStats(prev => {
        const totalExecutionTime = newTasks
          .filter(task => task.isCompleted || task.status === TaskStatus.COMPLETED)
          .reduce((sum, task) => sum + (task.executionTime || 0), 0);
        
        return {
          ...prev,
          completed: completedCount,
          successRate: (completedCount / prev.total) * 100,
          averageExecutionTime: completedCount > 0 ? totalExecutionTime / completedCount : 0,
        };
      });
      
      return newTasks;
    });
  };

  // 处理活动失败事件
  const handleActivityFail = (index: number, error: string) => {
    setTasksWithStatus(prevTasks => {
      const newTasks = [...prevTasks];
      if (newTasks[index]) {
        newTasks[index] = {
          ...newTasks[index],
          status: TaskStatus.FAILED,
          error: error
        };
      }
      return newTasks;
    });
    
    // 更新执行阶段为错误
    setExecutionPhase(ExecutionPhase.ERROR);
  };

  // 处理任务规划完成事件
  const handlePlanComplete = (plan: TaskPlan) => {
    console.log('规划完成:', plan);

    // 创建任务列表，初始时都标记为待执行
    const initialTasksWithStatus = plan.activities.map((activity, _index) => ({
      ...activity,
      isCompleted: false,
      executionTime: 0,
      status: TaskStatus.PENDING,
      startTime: null,
      error: null
    }));
    
    setTasksWithStatus(initialTasksWithStatus);
    setExecutionPhase(ExecutionPhase.EXECUTING);
    
    // 更新任务统计
    setTaskStats({
      total: plan.activities.length,
      completed: 0,
      successRate: 0,
      averageExecutionTime: 0,
      startTime: Date.now(),
      endTime: null,
    });
    
    // 更新标题显示任务总数
    document.title = `Web自动化测试 (0/${plan.activities.length})`;
  };

  // Handle form submission
  const handleRun = useCallback(async () => {
    const value = form.getFieldsValue();
    if (!value.prompt) {
      message.error('请输入任务描述');
      return;
    }

    const startTime = Date.now();

    setLoading(true);
    setExecutionPhase(ExecutionPhase.PLANNING);
    setResult(null);
    setCurrentActivityIndex(-1);
    setTasksWithStatus([]);
    setTaskStats({
      total: 0,
      completed: 0,
      successRate: 0,
      averageExecutionTime: 0,
      startTime: startTime,
      endTime: null,
    });
    const result: PlaygroundResult = { ...blankResult };

    const thisRunningId = Date.now();
    try {
      currentRunningIdRef.current = thisRunningId;
      interruptedFlagRef.current[thisRunningId] = false;

      const compositeAgent = new CompositeAgent(
        getAgent(forceSameTabNavigation)?.page,
        getAgent
      );
      
      // 设置进度提示回调
      compositeAgent.onProgressUpdate = (text: string) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        setLoadingProgressText(text);
      };
      
      // 设置活动开始回调
      compositeAgent.onActivityStart = (index: number) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        handleActivityStart(index);
      };
      
      // 设置活动完成回调
      compositeAgent.onActivityComplete = (index: number, executionTime: number) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        handleActivityComplete(index, executionTime);
      };
      
      // 设置活动失败回调
      compositeAgent.onActivityFail = (index: number, error: string) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        handleActivityFail(index, error);
      };
      
      // 设置规划完成回调
      compositeAgent.onPlanComplete = (plan: TaskPlan) => {
        if (interruptedFlagRef.current[thisRunningId]) {
          return;
        }
        handlePlanComplete(plan);
      };
      
      compositeAgentRef.current = compositeAgent;

      // 分两步执行：先规划，后执行
      try {
        // 1. 规划任务
        try {
          const { plan, activeAgent } = await compositeAgent.planTask(value.prompt, advancedKnowledge);
          
          if (interruptedFlagRef.current[thisRunningId]) {
            console.log('任务规划后被中断');
            return;
          }
          
          // 2. 执行已规划的任务
          const taskResult = await compositeAgent.executePlannedActivities(plan, activeAgent);
          
          if (interruptedFlagRef.current[thisRunningId]) {
            console.log('任务执行期间被中断', taskResult);
            return;
          }

          // 将每个活动的执行结果保存到对应的任务中
          if (taskResult.results && taskResult.results.length > 0) {
            setTasksWithStatus(prevTasks => {
              const newTasks = [...prevTasks];
              taskResult.results.forEach((result, idx) => {
                if (newTasks[idx]) {
                  newTasks[idx] = {
                    ...newTasks[idx],
                    result: result
                  };
                }
              });
              return newTasks;
            });
          }

          // 设置执行结果
          if (taskResult.success) {
            result.result = taskResult.results;
            setExecutionPhase(ExecutionPhase.COMPLETED);
          } else {
            result.error = taskResult.error || null;
            setExecutionPhase(ExecutionPhase.ERROR);
          }
        } catch (planError: any) {
          console.error('任务规划失败:', planError);
          result.error = formatErrorMessage(planError);
          setExecutionPhase(ExecutionPhase.ERROR);
        }
        
        // 更新任务统计数据的结束时间
        setTaskStats(prev => ({
          ...prev,
          endTime: Date.now()
        }));
      } catch (e: any) {
        console.error('任务执行出错:', e);
        result.error = formatErrorMessage(e);
        setExecutionPhase(ExecutionPhase.ERROR);
        
        // 错误时也更新结束时间
        setTaskStats(prev => ({
          ...prev,
          endTime: Date.now()
        }));
      }
    } catch (e: any) {
      result.error = formatErrorMessage(e);
      console.error(e);
      setExecutionPhase(ExecutionPhase.ERROR);
      
      // 错误时也更新结束时间
      setTaskStats(prev => ({
        ...prev,
        endTime: Date.now()
      }));
    }

    if (interruptedFlagRef.current[thisRunningId]) {
      console.log('已中断，结果是', result);
      return;
    }

    try {
      // 尝试获取转储数据
      const activeAgent = getAgent(forceSameTabNavigation);
      if (activeAgent?.dumpDataString) {
        result.dump = activeAgent.dumpDataString()
          ? JSON.parse(activeAgent.dumpDataString())
          : null;
      }
      console.log(result);
    } catch (e) {
      console.error(e);
    }

    try {
      // 销毁页面
      await compositeAgentRef.current?.destroy();
      console.log('页面已销毁');
    } catch (e) {
      console.error(e);
    }

    compositeAgentRef.current = null;
    setResult(result);
    setLoading(false);
    if (result?.dump) {
      const info = allScriptsFromDump(result.dump);
      setReplayScriptsInfo(info);
      setReplayCounter((c) => c + 1);
    } else {
      setReplayScriptsInfo(null);
    }
    console.log(`执行时间: ${Date.now() - startTime}毫秒`);
  }, [form, getAgent, forceSameTabNavigation, advancedKnowledge]);

  // Handle stop running
  const handleStop = async () => {
    const thisRunningId = currentRunningIdRef.current;
    if (thisRunningId) {
      await compositeAgentRef.current?.destroy();
      interruptedFlagRef.current[thisRunningId] = true;
      setLoading(false);
      setResult(null);
      setReplayScriptsInfo(null);
      setCurrentActivityIndex(-1);
      setExecutionPhase(ExecutionPhase.IDLE);
      // 更新任务统计的结束时间
      setTaskStats(prev => ({
        ...prev,
        endTime: Date.now()
      }));
      // 不清除任务列表，保持可见
      // setTasksWithStatus([]);
      console.log('已停止执行');
    }
  };

  // 处理重试操作
  const handleRetry = useCallback(() => {
    // 重新执行任务
    handleRun();
  }, [handleRun]);

  // Validate if it can run
  const runButtonEnabled = !!getAgent && configAlreadySet;

  // Check if it can be stopped
  const stoppable = !dryMode && loading;

  // 更新知识库配置
  const handleAdvancedKnowledgeChange = (value: Record<string, string>) => {
    setAdvancedKnowledge(value);
  };

  // 处理知识选择
  const handleKnowledgeSelected = (name: string) => {
    setSelectedKnowledge(name);
  };

  // 处理设置按钮点击
  const handleOpenSettings = () => {
    setSettingsVisible(true);
  };

  // 处理设置对话框关闭
  const handleCloseSettings = () => {
    setSettingsVisible(false);
  };

  return (
    <div className="playground-container vertical-mode">
      {/* 右上角设置按钮 */}
      <div className="settings-button-container">
        <Tooltip title="环境配置">
          <Button
            type="text"
            icon={<SettingOutlined />}
            onClick={handleOpenSettings}
            className="settings-button"
          />
        </Tooltip>
      </div>

      {/* 设置对话框 */}
      <SettingsModal visible={settingsVisible} onClose={handleCloseSettings} />
      
      <Form form={form} onFinish={handleRun}>
        <div className="playground-form-container">
          <ContextPreview
            uiContextPreview={uiContextPreview}
            setUiContextPreview={setUiContextPreview}
            showContextPreview={showContextPreview}
          />
          
          {/* 高级知识库轮播组件 */}
          <KnowledgeCarousel 
            onChange={handleAdvancedKnowledgeChange} 
            onSelected={handleKnowledgeSelected}
            selectedKnowledge={selectedKnowledge}
          />
          
          {/* 任务进度统计区域 */}
          {(taskStats.total > 0 || executionPhase !== ExecutionPhase.IDLE) && (
            <div className="task-stats-container">
              <div className="task-progress">
                <Progress 
                  percent={Math.round(taskStats.successRate)} 
                  status={executionPhase === ExecutionPhase.ERROR ? 'exception' : 
                          executionPhase === ExecutionPhase.COMPLETED ? 'success' : 'active'} 
                  size="small" 
                />
                <div className="task-progress-text">
                  已完成: {taskStats.completed}/{taskStats.total}
                  {taskStats.startTime && taskStats.endTime && (
                    <span className="task-time">
                      总耗时: {((taskStats.endTime - taskStats.startTime) / 1000).toFixed(1)}秒
                    </span>
                  )}
                  {taskStats.averageExecutionTime > 0 && (
                    <span className="task-time">
                      平均步骤耗时: {(taskStats.averageExecutionTime / 1000).toFixed(1)}秒
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* 始终显示任务列表区域，即使为空也预留位置 */}
          <div className="task-list-container">
            {loading ? (
              <TaskList 
                tasks={tasksWithStatus} 
                currentTaskIndex={currentActivityIndex} 
                loading={executionPhase === ExecutionPhase.PLANNING} 
                showTaskStatus={true}
              />
            ) : tasksWithStatus.length > 0 ? (
              <TaskList 
                tasks={tasksWithStatus} 
                currentTaskIndex={currentActivityIndex} 
                loading={false} 
                showTaskStatus={true}
              />
            ) : (
              <div className="task-list-placeholder">
                运行任务后将在此处显示执行步骤
              </div>
            )}
            {loading && loadingProgressText && (
              <div className={`execution-progress-indicator ${
                executionPhase === ExecutionPhase.PLANNING ? 'planning' : 'executing'
              }`}>
                <span className="execution-progress-label">
                  {executionPhase === ExecutionPhase.PLANNING ? '规划任务' : '执行操作'}
                </span>
                <span className="execution-progress-text">{loadingProgressText}</span>
              </div>
            )}

            {/* 显示执行阶段状态 */}
            {executionPhase !== ExecutionPhase.IDLE && (
              <div className="execution-phase-status">
                <span className={`phase-indicator phase-${executionPhase.toLowerCase()}`}>
                  {executionPhase === ExecutionPhase.PLANNING && '任务规划中'}
                  {executionPhase === ExecutionPhase.EXECUTING && '任务执行中'}
                  {executionPhase === ExecutionPhase.COMPLETED && '任务已完成'}
                  {executionPhase === ExecutionPhase.ERROR && '任务执行失败'}
                </span>
                {executionPhase === ExecutionPhase.ERROR && result?.error && (
                  <span className="error-message">{result.error}</span>
                )}
              </div>
            )}

            {/* 任务执行状态计数 */}
            {tasksWithStatus.length > 0 && (
              <div className="task-status-summary">
                <div className="status-item">
                  <span className="status-badge pending">待执行: {tasksWithStatus.filter(t => t.status === TaskStatus.PENDING).length}</span>
                </div>
                {tasksWithStatus.some(t => t.status === TaskStatus.RUNNING) && (
                  <div className="status-item">
                    <span className="status-badge running">执行中: {tasksWithStatus.filter(t => t.status === TaskStatus.RUNNING).length}</span>
                  </div>
                )}
                {tasksWithStatus.some(t => t.status === TaskStatus.COMPLETED) && (
                  <div className="status-item">
                    <span className="status-badge completed">已完成: {tasksWithStatus.filter(t => t.status === TaskStatus.COMPLETED).length}</span>
                  </div>
                )}
                {tasksWithStatus.some(t => t.status === TaskStatus.FAILED) && (
                  <div className="status-item">
                    <span className="status-badge failed">失败: {tasksWithStatus.filter(t => t.status === TaskStatus.FAILED).length}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <PromptInput
            runButtonEnabled={runButtonEnabled}
            form={form}
            serviceMode={'In-Browser-Extension'}
            selectedType={'composite'}
            dryMode={dryMode}
            stoppable={stoppable}
            loading={loading}
            onRun={handleRun}
            onStop={handleStop}
            isCompositeMode={true}
            hideRunButton={executionPhase === ExecutionPhase.ERROR || executionPhase === ExecutionPhase.COMPLETED}
          />
          
          {/* 重试按钮，任务出错或完成后可用 */}
          {(executionPhase === ExecutionPhase.ERROR || executionPhase === ExecutionPhase.COMPLETED) && !loading && (
            <div className="retry-button-container">
              <Button 
                type="primary" 
                onClick={handleRetry} 
                icon={<span className="retry-icon">↻</span>}
              >
                重新执行
              </Button>
            </div>
          )}
        </div>
      </Form>
      <div className="form-part" style={{display: 'none'}}>
        <PlaygroundResultView
          result={result}
          loading={loading}
          serviceMode={'In-Browser-Extension'}
          replayScriptsInfo={replayScriptsInfo}
          replayCounter={replayCounter}
          loadingProgressText={loadingProgressText}
          verticalMode={verticalMode}
        />
      </div>
    </div>
  );
}


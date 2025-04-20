import {useState, useEffect} from 'react';
import {Button, Typography, Badge, Modal, Form, Input, message} from 'antd';
import {LeftOutlined, RightOutlined, PlusOutlined, BookOutlined, UserOutlined, EditOutlined, CloseOutlined} from '@ant-design/icons';
import systemKnowledgeData from '../config/system-knowledge.json';

const {Paragraph, Text} = Typography;

type KnowledgeItem = {
    name: string;
    content: string;
    isCustom?: boolean;
};

interface KnowledgeCarouselProps {
    value?: Record<string, string>;
    onChange?: (value: Record<string, string>) => void;
    onSelected?: (name: string) => void;
    selectedKnowledge?: string | null;
}

// 本地存储键名
const STORAGE_KEY = 'midscene_custom_knowledge';

// 知识库分类
enum KnowledgeType {
    ALL = 'all',
    SYSTEM = 'system',
    CUSTOM = 'custom'
}

export function KnowledgeCarousel({
    onChange,
    onSelected,
    selectedKnowledge: externalSelectedKnowledge
}: KnowledgeCarouselProps) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [customKnowledge, setCustomKnowledge] = useState<KnowledgeItem[]>([]);
    const [selectedKnowledgeLocal, setSelectedKnowledgeLocal] = useState<string>('');
    const [activeTab, setActiveTab] = useState<KnowledgeType>(KnowledgeType.ALL);
    const [form] = Form.useForm();
    const [editForm] = Form.useForm();

    // 添加内容显示相关状态
    const [contentVisible, setContentVisible] = useState(false);
    const [currentContent, setCurrentContent] = useState<{name: string, content: string, isCustom?: boolean}>({
        name: '', 
        content: '',
        isCustom: false
    });
    const [isEditMode, setIsEditMode] = useState(false);
    // 添加删除确认模态框状态
    const [deleteModalVisible, setDeleteModalVisible] = useState(false);

    // 从配置文件加载系统内置的知识库
    const systemKnowledge: KnowledgeItem[] = systemKnowledgeData.systemKnowledge || [];

    // 初始化知识库
    useEffect(() => {
        // 从localStorage加载自定义知识
        try {
            const savedCustomKnowledge = localStorage.getItem(STORAGE_KEY);
            if (savedCustomKnowledge) {
                setCustomKnowledge(JSON.parse(savedCustomKnowledge));
            }
        } catch (e) {
            console.error('加载自定义知识失败', e);
        }

        // 如果外部已有选择的知识，则同步状态
        if (externalSelectedKnowledge) {
            setSelectedKnowledgeLocal(externalSelectedKnowledge);
        }

        // 添加全局事件监听器来处理知识内容显示
        const handleShowContent = (event: any) => {
            const { content, name, isCustom } = event.detail;
            setCurrentContent({ name, content, isCustom });
            setContentVisible(true);
            setIsEditMode(false);
        };

        window.addEventListener('showKnowledgeContent', handleShowContent);

        return () => {
            window.removeEventListener('showKnowledgeContent', handleShowContent);
        };
    }, []);

    // 同步外部selectedKnowledge变化
    useEffect(() => {
        if (externalSelectedKnowledge !== undefined && externalSelectedKnowledge !== null) {
            setSelectedKnowledgeLocal(externalSelectedKnowledge);
        }
    }, [externalSelectedKnowledge]);

    // 计算所有知识条目
    const allKnowledge = [...systemKnowledge, ...customKnowledge];

    // 根据当前激活的标签页过滤知识库列表
    const filteredKnowledge = activeTab === KnowledgeType.ALL 
        ? allKnowledge
        : activeTab === KnowledgeType.SYSTEM
            ? systemKnowledge
            : customKnowledge;

    // 更新知识库时触发onChange
    useEffect(() => {
        if (onChange && selectedKnowledgeLocal) {
            const selected = allKnowledge.find(item => item.name === selectedKnowledgeLocal);

            if (selected) {
                onChange({
                    [selected.name]: selected.content
                });
            }
        }
    }, [selectedKnowledgeLocal, customKnowledge, onChange, allKnowledge]);

    // 显示的知识库项（每页最多显示4个）
    const visibleKnowledge = filteredKnowledge.slice(
        currentIndex,
        Math.min(currentIndex + 4, filteredKnowledge.length)
    );

    // 添加自定义知识
    const handleAddCustom = (values: { name: string; content: string }) => {
        const newItem: KnowledgeItem = {
            name: values.name,
            content: values.content,
            isCustom: true
        };

        const updatedCustomKnowledge = [...customKnowledge, newItem];
        setCustomKnowledge(updatedCustomKnowledge);

        // 保存到localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCustomKnowledge));

        // 选中新添加的知识
        setSelectedKnowledgeLocal(newItem.name);
        if (onSelected) {
            onSelected(newItem.name);
        }

        form.resetFields();
        setIsModalVisible(false);
        
        // 切换到自定义知识标签
        setActiveTab(KnowledgeType.CUSTOM);
    };

    // 处理知识选择
    const handleSelect = (name: string) => {
        if (selectedKnowledgeLocal === name) {
            // 如果点击已选中的知识，则取消选择
            setSelectedKnowledgeLocal('');
            if (onSelected) {
                onSelected('');
            }
        } else {
            setSelectedKnowledgeLocal(name);
            if (onSelected) {
                onSelected(name);
            }
        }
    };

    // 前滚动
    const handleScrollPrev = () => {
        setCurrentIndex(prev => Math.max(0, prev - 1));
    };

    // 后滚动
    const handleScrollNext = () => {
        setCurrentIndex(prev => Math.min(filteredKnowledge.length - 4, prev + 1));
    };

    // 显示添加模态框
    const showAddModal = () => {
        form.resetFields();
        setIsModalVisible(true);
    };

    // 切换标签页
    const handleTabChange = (tabKey: KnowledgeType) => {
        setActiveTab(tabKey);
        setCurrentIndex(0); // 重置索引
    };

    // 渲染一个知识库卡片
    const renderKnowledgeCard = (item: KnowledgeItem) => (
        <div
            key={item.name}
            className={`knowledge-card ${
                selectedKnowledgeLocal === item.name ? 'selected' : ''
            } ${item.isCustom ? 'custom-knowledge' : 'system-knowledge'}`}
            onClick={() => handleSelect(item.name)}
        >
            <div className="knowledge-card-icon">
                {item.isCustom ? <UserOutlined /> : <BookOutlined />}
            </div>
            
            {/* 直接显示标题 */}
            <div className="knowledge-card-title">{item.name}</div>
            
            {/* 替换Tooltip为自定义内容显示功能 */}
            <div 
                className="knowledge-indicator"
                onClick={(e) => {
                    e.stopPropagation();
                    // 触发全局事件，显示内容弹框
                    const event = new CustomEvent('showKnowledgeContent', { 
                        detail: {
                            content: item.content,
                            name: item.name,
                            isCustom: item.isCustom
                        }
                    });
                    window.dispatchEvent(event);
                }}
            >
                <div className="knowledge-status-dot"></div>
                <span>查看</span>
            </div>
        </div>
    );

    // 判断是否需要显示导航按钮
    const showPrevButton = currentIndex > 0;
    const showNextButton = currentIndex < filteredKnowledge.length - 4;

    // 处理编辑自定义知识
    const handleEditCustom = (values: { name: string; content: string }) => {
        // 首先找到要编辑的知识
        const updatedCustomKnowledge = customKnowledge.map(item => {
            if (item.name === currentContent.name) {
                return {
                    ...item,
                    content: values.content // 只更新内容
                };
            }
            return item;
        });

        setCustomKnowledge(updatedCustomKnowledge);
        
        // 保存到localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCustomKnowledge));
        
        // 更新当前内容并关闭编辑模式
        setCurrentContent({
            ...currentContent,
            content: values.content
        });
        setIsEditMode(false);
        
        // 如果这个知识被选中，也要更新
        if (selectedKnowledgeLocal === currentContent.name && onChange) {
            onChange({
                [currentContent.name]: values.content
            });
        }
        
        message.success('知识内容已更新');
    };
    
    // 进入编辑模式
    const enterEditMode = () => {
        editForm.setFieldsValue({
            content: currentContent.content
        });
        setIsEditMode(true);
    };
    
    // 显示删除确认模态框
    const showDeleteConfirm = (e: React.MouseEvent) => {
        e.stopPropagation(); // 阻止事件冒泡
        setDeleteModalVisible(true);
    };
    
    // 处理删除自定义知识
    const handleDeleteKnowledge = () => {
        // 过滤掉要删除的知识
        const updatedCustomKnowledge = customKnowledge.filter(
            item => item.name !== currentContent.name
        );
        
        setCustomKnowledge(updatedCustomKnowledge);
        
        // 保存到localStorage
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedCustomKnowledge));
        
        // 如果当前删除的是已选中的知识，则取消选择
        if (selectedKnowledgeLocal === currentContent.name) {
            setSelectedKnowledgeLocal('');
            if (onSelected) {
                onSelected('');
            }
        }
        
        // 关闭模态框
        setDeleteModalVisible(false);
        setContentVisible(false);
        
        message.success('知识已删除');
    };

    return (
        <div className="knowledge-carousel">
            <div className="knowledge-carousel-header">
                <span className="knowledge-carousel-title">高级知识库</span>
                {selectedKnowledgeLocal && (
                    <Badge
                        count={<Text className="selected-badge">{selectedKnowledgeLocal}</Text>}
                        offset={[5, 0]}
                    />
                )}
                <Button
                    type="primary"
                    icon={<PlusOutlined/>}
                    size="small"
                    onClick={showAddModal}
                    className="add-knowledge-btn"
                />
            </div>

            {/* 知识库分类标签 */}
            <div className="knowledge-tabs">
                <div 
                    className={`knowledge-tab ${activeTab === KnowledgeType.ALL ? 'active' : ''}`}
                    onClick={() => handleTabChange(KnowledgeType.ALL)}
                >
                    全部
                </div>
                <div 
                    className={`knowledge-tab ${activeTab === KnowledgeType.SYSTEM ? 'active' : ''}`}
                    onClick={() => handleTabChange(KnowledgeType.SYSTEM)}
                >
                    系统
                </div>
                <div 
                    className={`knowledge-tab ${activeTab === KnowledgeType.CUSTOM ? 'active' : ''}`}
                    onClick={() => handleTabChange(KnowledgeType.CUSTOM)}
                >
                    自定义
                </div>
            </div>

            <div className="knowledge-carousel-container">
                {showPrevButton && (
                    <Button
                        type="text"
                        icon={<LeftOutlined/>}
                        onClick={handleScrollPrev}
                        className="carousel-nav-button prev-button"
                    />
                )}

                <div className="knowledge-cards">
                    {visibleKnowledge.length > 0 ? (
                        visibleKnowledge.map(renderKnowledgeCard)
                    ) : (
                        <div className="empty-knowledge">
                            {activeTab === KnowledgeType.CUSTOM ? (
                                <div className="empty-knowledge-prompt" onClick={showAddModal}>
                                    <div className="empty-knowledge-box">
                                        <PlusOutlined className="empty-knowledge-icon" />
                                    </div>
                                </div>
                            ) : (
                                <span>没有可用的知识库</span>
                            )}
                        </div>
                    )}
                </div>

                {showNextButton && (
                    <Button
                        type="text"
                        icon={<RightOutlined/>}
                        onClick={handleScrollNext}
                        className="carousel-nav-button next-button"
                    />
                )}
            </div>

            {/* 添加知识模态框 */}
            <Modal
                title="添加自定义知识"
                open={isModalVisible}
                onCancel={() => setIsModalVisible(false)}
                onOk={() => form.submit()}
                destroyOnClose
                className="knowledge-modal"
            >
                <Form
                    form={form}
                    layout="vertical"
                    onFinish={handleAddCustom}
                >
                    <Paragraph type="secondary" style={{marginBottom: 12, fontSize: 12}}>
                        添加自定义知识可帮助AI更好地理解特定网站类型
                    </Paragraph>

                    <Form.Item
                        name="name"
                        label="知识名称"
                        rules={[
                            {required: true, message: '请输入知识名称'},
                            {
                                validator: (_, value) => {
                                    return allKnowledge.find(item => item.name === value)
                                        ? Promise.reject(new Error('知识名称已存在'))
                                        : Promise.resolve();
                                }
                            }
                        ]}
                    >
                        <Input placeholder="例如: 电子商务网站"/>
                    </Form.Item>
                    <Form.Item
                        name="content"
                        label="知识内容"
                        rules={[{required: true, message: '请输入知识内容'}]}
                    >
                        <Input.TextArea
                            rows={3}
                            placeholder="请输入对该知识的详细描述"
                        />
                    </Form.Item>
                </Form>
            </Modal>

            {/* 知识内容显示弹框 */}
            <Modal
                title={
                    <div className="content-modal-title">
                        <span>{currentContent.name}</span>
                        {currentContent.isCustom && !isEditMode && (
                            <div className="content-modal-actions">
                                <Button 
                                    type="text" 
                                    size="small" 
                                    icon={<EditOutlined />} 
                                    onClick={enterEditMode}
                                    className="edit-knowledge-btn"
                                />
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    icon={<CloseOutlined />}
                                    onClick={showDeleteConfirm}
                                    className="delete-knowledge-btn"
                                />
                            </div>
                        )}
                    </div>
                }
                open={contentVisible}
                onCancel={() => setContentVisible(false)}
                footer={null}
                destroyOnClose
                className="knowledge-content-modal"
                centered
                width={340}
                closeIcon={<CloseOutlined />}
            >
                {isEditMode ? (
                    <Form
                        form={editForm}
                        layout="vertical"
                        onFinish={handleEditCustom}
                        className="edit-knowledge-form"
                    >
                        <Form.Item
                            name="content"
                            label="知识内容"
                            rules={[{required: true, message: '请输入知识内容'}]}
                        >
                            <Input.TextArea
                                rows={5}
                                placeholder="请输入对该知识的详细描述"
                                autoFocus
                            />
                        </Form.Item>
                        <div className="edit-actions">
                            <Button 
                                onClick={() => setIsEditMode(false)}
                            >
                                取消
                            </Button>
                            <Button 
                                type="primary" 
                                htmlType="submit"
                            >
                                保存
                            </Button>
                        </div>
                    </Form>
                ) : (
                    <div className="knowledge-content">
                        {currentContent.content}
                    </div>
                )}
            </Modal>

            {/* 删除确认模态框 */}
            <Modal
                title="确认删除"
                open={deleteModalVisible}
                onCancel={() => setDeleteModalVisible(false)}
                onOk={handleDeleteKnowledge}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true }}
                className="knowledge-delete-modal"
                centered
                width={340}
                closeIcon={<CloseOutlined />}
            >
                <p>确定要删除知识「{currentContent.name}」吗？此操作不可撤销。</p>
            </Modal>
        </div>
    );
} 
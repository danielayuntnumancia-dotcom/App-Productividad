import React, { useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Tarea } from '../types';
import { getPriorityBadgeClass, getConcejaliaStyle } from '../utils/concejaliaColors';
import { getTaskDeadlineInfo } from '../utils/deadlines';
import { motion } from 'framer-motion';

interface KanbanBoardProps {
  tasks: Tarea[];
  onTaskStatusChange: (taskId: string, newStatus: string) => Promise<void>;
  onSelectTask: (task: Tarea) => void;
}

const COLUMNS = [
  { id: 'todo', title: 'Pendientes', color: 'bg-slate-100 dark:bg-slate-800/50' },
  { id: 'in_progress', title: 'En Curso', color: 'bg-indigo-50 dark:bg-indigo-900/20' },
  { id: 'waiting_on_third_party', title: 'Retenidas', color: 'bg-amber-50 dark:bg-amber-900/20' },
  { id: 'completed', title: 'Completadas', color: 'bg-emerald-50 dark:bg-emerald-900/20' },
];

export default function KanbanBoard({ tasks, onTaskStatusChange, onSelectTask }: KanbanBoardProps) {
  // Memoize grouped tasks
  const groupedTasks = useMemo(() => {
    const groups: Record<string, Tarea[]> = {
      todo: [],
      in_progress: [],
      waiting_on_third_party: [],
      completed: [],
    };

    tasks.forEach(t => {
      let status = t.status || 'todo';
      if (t.completada && status !== 'completed') {
        status = 'completed'; // Ensure backwards compatibility
      }
      if (groups[status]) {
        groups[status].push(t);
      } else {
        groups['todo'].push(t);
      }
    });

    return groups;
  }, [tasks]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const newStatus = destination.droppableId;
    // Optimistic UI update could go here if we managed local state, 
    // but we'll rely on Firestore snapshot for simplicity.
    await onTaskStatusChange(draggableId, newStatus);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="flex gap-4 overflow-x-auto pb-4 h-full min-h-[60vh] snap-x">
        {COLUMNS.map(column => (
          <div key={column.id} className="min-w-[300px] w-[320px] shrink-0 snap-start flex flex-col h-full">
            {/* Column Header */}
            <div className={`px-4 py-3 rounded-t-2xl border-x border-t border-slate-200 dark:border-brand-surface-light ${column.color} flex items-center justify-between`}>
              <h3 className="font-bold text-sm text-slate-700 dark:text-slate-200">{column.title}</h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/50 dark:bg-black/20 text-slate-600 dark:text-slate-300">
                {groupedTasks[column.id].length}
              </span>
            </div>

            {/* Droppable Area */}
            <Droppable droppableId={column.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`flex-1 p-3 rounded-b-2xl border-x border-b border-slate-200 dark:border-brand-surface-light transition-colors ${snapshot.isDraggingOver ? 'bg-slate-50 dark:bg-brand-surface/80' : 'bg-slate-50/50 dark:bg-brand-surface/40'} flex flex-col gap-3 min-h-[150px] overflow-y-auto`}
                >
                  {groupedTasks[column.id].map((task, index) => (
                    <Draggable key={task.id} draggableId={task.id!} index={index}>
                      {(provided, snapshot) => (
                        <motion.div
                          layoutId={task.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          {...provided.dragHandleProps}
                          onClick={() => onSelectTask(task)}
                          className={`bg-white dark:bg-brand-surface p-4 rounded-xl border transition-all cursor-pointer shadow-sm select-none
                            ${snapshot.isDragging 
                              ? 'border-brand-primary shadow-xl rotate-2 z-50' 
                              : 'border-slate-200 dark:border-brand-surface-light hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'
                            }
                          `}
                          style={provided.draggableProps.style}
                        >
                          {/* Task Content */}
                          <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap gap-1.5 items-center">
                              {(() => {
                                const dl = getTaskDeadlineInfo(task);
                                if (dl.severity !== 'none') {
                                  return (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded border font-bold ${dl.badgeClass}`}>
                                      {dl.formattedText}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {task.prioridad && (
                                <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border ${getPriorityBadgeClass(task.prioridad, (task as any).priority)} shrink-0`}>
                                  {task.prioridad.toUpperCase()}
                                </span>
                              )}
                            </div>
                            
                            <h4 className={`text-sm font-bold leading-tight ${task.status === 'completed' ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                              {task.titulo}
                            </h4>
                            
                            {task.projectName && (
                              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-1">
                                📁 <span className="truncate">{task.projectName}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        ))}
      </div>
    </DragDropContext>
  );
}

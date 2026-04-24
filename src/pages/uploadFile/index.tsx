// @ts-ignore
import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Button, Upload, UploadFile, UploadProps, Table, Form, Select, FormInstance, Switch, notification, Spin, Collapse, message, Checkbox, Input, Space, Popconfirm, Progress } from 'antd'
import { UploadOutlined, FileAddOutlined, CloudUploadOutlined, DeleteOutlined, SaveOutlined, CopyOutlined } from '@ant-design/icons';
import Editor from './codeEditor';
import './style.css'
import { FieldType, IBaseViewMeta, IFieldMeta, IOpenAttachment, IOpenCellValue, IField, ITable, IView, ITableMeta, ViewType, bitable, IRecord } from '@lark-base-open/js-sdk';
import { fieldIcons } from './icons'
import TextArea from 'antd/es/input/TextArea';
//@ts-ignore
window.bitable = bitable
//@ts-ignore
window._reg = /[\n]+/g
enum UploadFileActionType {
    /** 自定义pickFile函数.. */
    GetFileByName = 0,
    /** 新增一行记录并依次上传文件，一行记录对应一个文件 */
    AddNewRecord = 1
}

type TableRecordsCacheEntry = {
    fieldSet: Set<string>,
    promise: Promise<{ recordIds: string[], records: IRecord[] }>,
}

const tableRecordsCache = new Map<string, TableRecordsCacheEntry>()

function normalizeFieldIds(fields?: string[]) {
    if (!fields?.length) return []
    return Array.from(new Set(fields.filter(Boolean))).sort()
}

function isSuperset(set: Set<string>, subset: Set<string>) {
    for (const v of subset) {
        if (!set.has(v)) return false
    }
    return true
}

async function loadTableRecords(
    table: ITable,
    viewId: string,
    forceReload = false,
    fields?: string[],
    onProgress?: (p: { loaded: number, total?: number, percent?: number }) => void
) {
    const cacheKey = `${table.id}:${viewId}`
    const wantedFieldIds = normalizeFieldIds(fields)
    const wantedSet = new Set(wantedFieldIds)

    if (forceReload) {
        tableRecordsCache.delete(cacheKey)
    }

    const cached = tableRecordsCache.get(cacheKey)
    if (cached && isSuperset(cached.fieldSet, wantedSet)) {
        return cached.promise
    }

    // Only keep fields we actually need in memory. If subsequent calls need more fields,
    // we reload and expand the cached fieldSet.
    const fieldSet = cached ? new Set([...cached.fieldSet, ...wantedSet]) : wantedSet

    const task = (async () => {
        let recordData: any;
        let token = undefined as any;
        const records: IRecord[] = []
        const recordIdList: string[] = []
        const totalGetter = (d: any) => (typeof d?.total === 'number' ? d.total : undefined)
        const updateProgress = () => {
            const total = totalGetter(recordData)
            const loaded = recordIdList.length
            const percent = total && total > 0 ? Math.min(100, Math.max(0, Math.round((loaded / total) * 100))) : undefined
            onProgress?.({ loaded, total, percent })
        }
        do {
            console.log('=== loadTableRecords page', { tableId: table.id, viewId, pageToken: token })
            recordData = await table.getRecordsByPage(
                token
                    ? { pageToken: token, pageSize: 200, viewId, stringValue: false }
                    : { pageSize: 200, viewId, stringValue: false }
            )
            token = recordData.pageToken;

            recordData.records.forEach((r: any) => {
                const picked: any = {}
                fieldSet.forEach((fid) => {
                    picked[fid] = r.fields[fid]
                })
                records.push({ recordId: r.recordId, fields: picked } as any)
                if (r.recordId) recordIdList.push(r.recordId)
            })
            updateProgress()
        } while (recordData.hasMore);
        console.log('=== loadTableRecords done', { tableId: table.id, viewId, recordCount: recordIdList.length, fieldCount: fieldSet.size })
        return { recordIds: recordIdList, records }
    })().catch((error) => {
        tableRecordsCache.delete(cacheKey)
        throw error
    })

    tableRecordsCache.set(cacheKey, { fieldSet, promise: task })
    return task
}

function getTemp() {
    return [{
        code: `//${t('code.23')}
/**
 * compareValues：${t('code.24')}
 * fileList: ${t('code.25')}
 * currentValue: ${t('code.26')}
 */
function pickFile({ compareValues, fileList, currentValue }) {
  const reg = window._reg instanceof RegExp ? window._reg : /[,，。、;；\\s]+/g
  const firstCellValue = compareValues && compareValues.length ? compareValues[0] : null
  if (firstCellValue === null || firstCellValue === undefined) {
    // ${t('code.7')}
    return currentValue
  }

  function normalizeName(input) {
    let str = input === null || input === undefined ? '' : String(input)
    if (typeof str.normalize === 'function') {
      str = str.normalize('NFC')
    }
    str = str.trim()
    return str.replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g, '_')
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value
        .map((v) => {
          if (v && typeof v === 'object' && 'text' in v) return v.text
          return v === null || v === undefined ? '' : String(v)
        })
        .join('')
    }
    if (value && typeof value === 'object' && 'text' in value) {
      return value.text
    }
    return String(value)
  }

  const raw = toText(firstCellValue)
  const parts = raw.split(reg).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return currentValue

  const wantedRaw = new Set(parts)
  const wantedNorm = new Set(parts.map(normalizeName))

  const files = fileList.filter((file) => {
    const name = file && file.name ? String(file.name) : ''
    if (!name) return false
    // ${t('code.9')}
    const dot = name.lastIndexOf('.')
    const prefix = dot > 0 ? name.slice(0, dot) : name
    const nameNorm = normalizeName(name)
    const prefixNorm = normalizeName(prefix)
    // ${t('code.10')}
    return (
      wantedRaw.has(prefix) ||
      wantedRaw.has(name) ||
      wantedNorm.has(prefixNorm) ||
      wantedNorm.has(nameNorm)
    )
  })
  if (files.length) {
    return files;
  }
  return currentValue // ${t('code.21')}
}`,
        desc: t('upload.by.name.desc'),
        title: t('upload.by.name.title'),
        type: UploadFileActionType.GetFileByName,
        default: false,
    },
    {
        desc: t('upload.by.new.record'),
        title: t('upload.by.new.record.title'),
        type: UploadFileActionType.AddNewRecord,
        default: true,
        code: '',
    }
    ]
}


/** 选择上传模式 */
function ChooseTemp({ onChange }: { onChange: (arg: any) => any }) {

    const functionsExample = useMemo(() => getTemp(), [])
    const [type, setType] = useState(functionsExample.find((v) => v.default)?.type)

    return <div>
        <Select
            style={{ width: '100%' }}
            defaultValue={functionsExample.find((v) => v.default)?.type}
            options={functionsExample.map(({ code, desc, title, type }) => {
                return { value: type, label: title }
            })}
            onChange={(v) => {
                onChange(v);
                setType(v)
            }}>
        </Select>
        <p>
            {functionsExample.find((v) => v.type === type)!.desc}
        </p>
    </div>

}



/** 文件和上传完成的token */
const fielTokenMap = new Map<File, string>()

/* 记录需要改动的记录,null清空，undefined表示使用原来的值 */
const recordFiles = new Map<string, (File | IOpenAttachment)[] | null | undefined>()

type CurrentSelection = {
    tableId?: string,
    viewId?: string,
}

type SelectionContext = {
    tableId: string,
    viewId: string,
    tableName: string,
    viewName: string,
    table: ITable,
    view: IView,
    tableMetaList: ITableMeta[],
    viewMetaList: IBaseViewMeta[],
    fieldMetaList: IFieldMeta[],
    defaultFileFieldId?: string,
    defaultCompareIds: string[],
}

export default function RefreshCom() {
    const [selection, setSelection] = useState<CurrentSelection>();
    const [selectionContext, setSelectionContext] = useState<SelectionContext>();
    useEffect(() => {
        let dispose: undefined | (() => void)
        bitable.base.getSelection().then(({ tableId, viewId }) => {
            setSelection({ tableId: tableId || undefined, viewId: viewId || undefined })
        })
        dispose = bitable.base.onSelectionChange((selection) => {
            setSelection({
                tableId: selection.data.tableId || undefined,
                viewId: selection.data.viewId || undefined,
            });
        })
        return () => {
            dispose?.()
        }
    }, [])

    useEffect(() => {
        let cancelled = false
        const { tableId, viewId } = selection || {}
        if (!tableId || !viewId) {
            setSelectionContext(undefined)
            return
        }
        (async () => {
            console.log('=== RefreshCom load selection context start', { tableId, viewId })
            const [table, tableMetaList] = await Promise.all([
                bitable.base.getTableById(tableId),
                bitable.base.getTableMetaList()
            ])
            const [view, viewMetaList] = await Promise.all([
                table.getViewById(viewId),
                table.getViewMetaList()
            ])
            const fieldMetaList = await view.getFieldMetaList()
            const attachmentFields = fieldMetaList.filter(({ type }) => type === FieldType.Attachment)
            const tableName = tableMetaList.find(({ id }) => id === tableId)?.name || tableId
            const viewName = viewMetaList.find(({ id }) => id === viewId)?.name || viewId
            const ctx: SelectionContext = {
                tableId,
                viewId,
                tableName,
                viewName,
                table,
                view,
                tableMetaList,
                viewMetaList: viewMetaList.filter(({ type }) => type === ViewType.Grid),
                fieldMetaList,
                defaultFileFieldId: attachmentFields[0]?.id,
                defaultCompareIds: fieldMetaList[0]?.id ? [fieldMetaList[0].id] : [],
            }
            if (cancelled) return
            setSelectionContext(ctx)
            console.log('=== RefreshCom load selection context done', { tableId, viewId })
        })().catch((error) => {
            console.log('=== RefreshCom load selection context error', error)
        });
        return () => {
            cancelled = true
        }
    }, [selection?.tableId, selection?.viewId])

    if (!selection?.tableId || !selection?.viewId) {
        return <h1>{t('selection.missing')}</h1>
    }

    if (!selectionContext || selectionContext.tableId !== selection.tableId || selectionContext.viewId !== selection.viewId) {
        return <Spin spinning={true}>1</Spin>
    }

    return <div>
        <UploadFileToForm currentSelection={selection} selectionContext={selectionContext} />
    </div>
}


function UploadFileToForm({ currentSelection, selectionContext }: { currentSelection: CurrentSelection, selectionContext: SelectionContext }) {
    const functionsExample = useMemo(() => getTemp(), [])
    const [fileList, setFileList] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const defaultMode = functionsExample.find((v) => v.default)!
    // 已上传完成
    const [uploadEnd, setUploadEnd] = useState(false)

    // 预览表格是否符合表单所选项目
    const [preTableFitForm, setPreTableFitForm] = useState(false)
    const [loadingContent, setLoadingContent] = useState('')
    const [uploadProgress, setUploadProgress] = useState<null | { done: number, total: number, percent: number }>(null)
    const [fieldMetaList, setFieldMetaList] = useState<IFieldMeta[]>()

    const [PreTable, setPreTable] = useState<any>(null)

    const [uploadActionType, setUploadActionType] = useState(defaultMode.type)

    const [savedRules, setSavedRules] = useState<{ id: string, name: string, code: string }[]>([])
    const [currentRuleId, setCurrentRuleId] = useState<string>('default')
    const [ruleName, setRuleName] = useState('')
    const [currentLocation, setCurrentLocation] = useState({
        tableId: '',
        tableName: '',
        viewId: '',
        viewName: '',
    })

    useEffect(() => {
        bitable.bridge.getData('BATCH_UPLOAD_RULES').then((data: any) => {
            if (data && data.rules) {
                setSavedRules(data.rules)
                if (data.lastUsedId) {
                    const rule = data.rules.find((r: any) => r.id === data.lastUsedId)
                    if (rule) {
                        setCurrentRuleId(rule.id)
                        codeEditorValue.current = rule.code
                    }
                }
            }
        })
    }, [])

    const handleSaveRule = () => {
        if (!ruleName.trim()) {
            message.error(t('rule.name.placeholder'))
            return
        }

        if (currentRuleId === 'default') {
            // 新建规则 - 检查名称重复
            const nameExists = savedRules.some(r => r.name === ruleName.trim())
            if (nameExists) {
                message.error(t('rule.name.duplicate'))
                return
            }

            const newRule = {
                id: Date.now().toString(),
                name: ruleName.trim(),
                code: codeEditorValue.current
            }
            const newRules = [...savedRules, newRule]
            setSavedRules(newRules)
            setCurrentRuleId(newRule.id)
            setRuleName(newRule.name)
            bitable.bridge.setData('BATCH_UPLOAD_RULES', { rules: newRules, lastUsedId: newRule.id })
            message.success(t('rule.save.success'))
        } else {
            // 更新现有规则 - 检查除自身外的名称重复
            const nameExists = savedRules.some(r => r.name === ruleName.trim() && r.id !== currentRuleId)
            if (nameExists) {
                message.error(t('rule.name.duplicate'))
                return
            }

            const newRules = savedRules.map(r => {
                if (r.id === currentRuleId) {
                    return { ...r, name: ruleName.trim(), code: codeEditorValue.current }
                }
                return r
            })
            setSavedRules(newRules)
            bitable.bridge.setData('BATCH_UPLOAD_RULES', { rules: newRules, lastUsedId: currentRuleId })
            message.success(t('rule.save.success'))
        }
    }

    const handleSaveAsRule = () => {
        if (!ruleName.trim()) {
            message.error(t('rule.name.placeholder'))
            return
        }

        // 检查名称重复
        const nameExists = savedRules.some(r => r.name === ruleName.trim())
        if (nameExists) {
            message.error(t('rule.name.duplicate'))
            return
        }

        // 另存为新规则，强制生成新ID
        const newRule = {
            id: Date.now().toString(),
            name: ruleName.trim(),
            code: codeEditorValue.current
        }
        const newRules = [...savedRules, newRule]
        setSavedRules(newRules)
        setCurrentRuleId(newRule.id)
        setRuleName(newRule.name)
        bitable.bridge.setData('BATCH_UPLOAD_RULES', { rules: newRules, lastUsedId: newRule.id })
        message.success(t('rule.save.success'))
    }

    const handleDeleteRule = () => {
        const newRules = savedRules.filter(r => r.id !== currentRuleId)
        setSavedRules(newRules)
        setCurrentRuleId('default')
        setRuleName('')
        const defaultCode = functionsExample.find(v => v.type === UploadFileActionType.GetFileByName)?.code
        if (defaultCode) {
            codeEditorValue.current = defaultCode
        }
        bitable.bridge.setData('BATCH_UPLOAD_RULES', { rules: newRules, lastUsedId: 'default' })
        message.success(t('rule.delete.success'))
    }

    const handleRuleChange = (ruleId: string) => {
        setCurrentRuleId(ruleId)
        if (ruleId === 'default') {
            const defaultCode = functionsExample.find(v => v.type === UploadFileActionType.GetFileByName)?.code
            if (defaultCode) {
                codeEditorValue.current = defaultCode
            }
            setRuleName('')
        } else {
            const rule = savedRules.find(r => r.id === ruleId)
            if (rule) {
                codeEditorValue.current = rule.code
                setRuleName(rule.name)
            }
        }
        bitable.bridge.setData('BATCH_UPLOAD_RULES', { rules: savedRules, lastUsedId: ruleId })
    }

    const codeEditorValue = useRef(defaultMode.code)
    const [form] = Form.useForm()
    const tableInfo = useRef<
        {
            tableId: string,
            table: ITable,
            tableMetaList: ITableMeta[],
            viewMetaList: IBaseViewMeta[],
            view: IView | null,
            attatchmentField: IField,
            viewRecordIdList: string[],
            // 所用到的值列表
            comparesFieldValueList: {
                [fieldId: string]: {
                    [recordId: string]: IOpenCellValue
                }
            },
            /** 已经存在的文件值的列表 */
            exitFileValueList: {
                [recordId: string]: IOpenCellValue
            }
        }
    >()

    const applySelectionContext = (selection: CurrentSelection = currentSelection, options?: { resetRecords?: boolean }) => {
        const { tableId, viewId } = selectionContext
        if (!tableId || !viewId || selection.tableId !== tableId || selection.viewId !== viewId) {
            return
        }

        const { table, view, tableMetaList, viewMetaList, fieldMetaList } = selectionContext
        setFieldMetaList(fieldMetaList)
        const attachmentFields = fieldMetaList.filter(({ type }) => type === FieldType.Attachment)
        if (!attachmentFields.length) {
            message.error(t('file.field.missing'));
        }
        setCurrentLocation({
            tableId,
            tableName: selectionContext.tableName || tableId,
            viewId,
            viewName: selectionContext.viewName || viewId,
        })

        tableInfo.current = {
            ...tableInfo.current || {}
            , tableId,
            table,
            view,
            tableMetaList,
            viewRecordIdList: options?.resetRecords ? [] : (tableInfo.current?.viewRecordIdList || []),
            viewMetaList,
        } as any;

        form.setFieldsValue({
            tableId,
            viewId,
            fileFieldId: selectionContext.defaultFileFieldId,
            compares: selectionContext.defaultCompareIds.length ? selectionContext.defaultCompareIds : undefined,
        })
        return { table, view, fieldMetaList }
    }

    const updateTableInfo = async (selection: CurrentSelection = currentSelection, options?: { loadRecords?: boolean, forceReload?: boolean }) => {
        setLoading(true)
        const applied = applySelectionContext(selection)
        if (!applied) {
            setLoading(false)
            return
        }

        const { table, view, fieldMetaList } = applied
        let viewRecordIdList: string[] = []
        let records: IRecord[] = []
        if (options?.loadRecords) {
            setLoadingContent(t('loading.records.progress', { loaded: 0, total: '-', percent: '-' }))
            const currentFormValues = form.getFieldsValue(['fileFieldId', 'compares'])
            const compareIds: string[] = Array.isArray(currentFormValues.compares) ? currentFormValues.compares : []
            const needFieldIds = Array.from(new Set([...(compareIds || []), currentFormValues.fileFieldId].filter(Boolean)))
            const result = await loadTableRecords(
                table,
                selectionContext.viewId,
                options.forceReload,
                needFieldIds,
                ({ loaded, total, percent }) => {
                    setLoadingContent(t('loading.records.progress', {
                        loaded,
                        total: total ?? '-',
                        percent: percent ?? '-',
                    }))
                }
            )
            viewRecordIdList = result.recordIds.filter(Boolean)
            records = result.records
            if (tableInfo.current) {
                tableInfo.current.viewRecordIdList = viewRecordIdList
            }
        }

        setLoading(false);
        return { table, view, records, viewRecordIdList, fieldMetaList }
    }


    useEffect(() => {
        recordFiles.clear()
        setPreTable(null)
        setPreTableFitForm(false)
        setUploadEnd(false)
        applySelectionContext(currentSelection, { resetRecords: true })
    }, [currentSelection.tableId, currentSelection.viewId])

    useMemo(() => {
        if (uploadActionType === UploadFileActionType.GetFileByName && currentRuleId !== 'default') {
            const rule = savedRules.find(r => r.id === currentRuleId)
            if (rule) {
                codeEditorValue.current = rule.code
                return
            }
        }
        codeEditorValue.current = functionsExample.find((v) => v.type === uploadActionType)!.code
    }, [uploadActionType, currentRuleId, savedRules])
    const onClickUpload = async () => {
        const fieldId: string = form.getFieldValue('fileFieldId');
        const table = tableInfo.current?.table
        setLoading(true)
        setLoadingContent('')
        // Upload progress for new File objects only (already-tokened files are ignored).
        const totalSet = new Set<File>()
        for (const [, files] of recordFiles) {
            if (!files || files === undefined) continue
            files.forEach((f: any) => {
                if (f instanceof File && !fielTokenMap.has(f)) totalSet.add(f)
            })
        }
        const total = totalSet.size
        let done = 0
        setUploadProgress(total > 0 ? { done: 0, total, percent: 0 } : null)

        const isEmptyAttachmentValue = (v: any) => {
            if (v === null || v === undefined) return true
            if (Array.isArray(v)) return v.length === 0
            return false
        }
        try {
            for (const [recordId, files] of recordFiles) {
                if (files === undefined) {
                    continue;
                }
                const currentCellValue = tableInfo.current?.exitFileValueList?.[recordId]
                const currentIsEmpty = isEmptyAttachmentValue(currentCellValue)
                if (files === null) {
                    // Skip no-op: already empty.
                    if (currentIsEmpty) continue
                    await table?.setCellValue(fieldId, recordId, null);
                    continue
                }

                const timeStamp = new Date().getTime();
                const currentUploadingFies: string = files.map(({ name }) => name).join('，');
                setLoadingContent(
                    `${t('uploading.now')}${currentUploadingFies}\n` +
                    `${t('upload.progress', { done, total, percent: total ? Math.round((done / total) * 100) : 0 })}`
                )
                const allFilesToBeUpload: File[] = files.filter((f) => (f instanceof File) && !fielTokenMap.has(f)) as any
                for (let index = 0; index < allFilesToBeUpload.length; index += 5) {
                    const elements: (File)[] = allFilesToBeUpload.slice(index, index + 5)

                    let tokens: string[] = []
                    if (elements.length) {
                        tokens = await bitable.base.batchUploadFile(elements);
                    }
                    elements.forEach((f, index) => {
                        if (typeof f === 'object') {
                            fielTokenMap.set(f, tokens[index]);
                        }
                    })
                    done += elements.length
                    if (total > 0) {
                        const percent = Math.min(100, Math.max(0, Math.round((done / total) * 100)))
                        setUploadProgress({ done, total, percent })
                        setLoadingContent(
                            `${t('uploading.now')}${currentUploadingFies}\n` +
                            `${t('upload.progress', { done, total, percent })}`
                        )
                    }
                }

                const cellValue: IOpenAttachment[] = files.map((f) => {
                    if (!(f instanceof File)) {
                        return f
                    }

                    return {
                        name: f.name,
                        size: f.size,
                        type: f.type,
                        token: fielTokenMap.get(f)!,
                        timeStamp,
                    }
                })
                const nextIsEmpty = !cellValue || cellValue.length === 0
                // Skip no-op: setting empty while already empty.
                if (nextIsEmpty && currentIsEmpty) continue
                await table?.setCellValue(fieldId, recordId, nextIsEmpty ? null : cellValue)

            }
            setUploadEnd(true)

        } catch (error) {
            message.error(t('upload.error') + '\n' + String(error))
        }
        setLoadingContent('')
        setUploadProgress(null)
        setLoading(false)
    }



    async function uploadAndAddNewRecord(fileList: File[]) {
        const { fileFieldId } = form.getFieldsValue();
        const table = tableInfo.current!.table;
        const failedFilesNameErrMap: Map<string, string> = new Map();
        const progressState = {
            total: fileList.length,
            processedOnce: new Set<File>(),
            done: 0,
        }

        /**
         * 
         * @param fileList 待上传的列表
         * @param nameTokenMap 文件名和batchuploadFile的token
         * @param remainTryTimes 剩余重试次数。
         * @returns 
         */
        async function loopUpload(fileList: File[], nameTokenMap: Map<string, string> = new Map, remainTryTimes = 1): Promise<File[]> {
            let failedFiles: File[] = [];
            let currentSetFiles: any = [];
            try {
                const step = 1; // 不改，addRecords好像有问题，改成使用addRecors
                for (let index = 0; index < fileList.length; index += step) {
                    const timeStamp = new Date().getTime();
                    const files = fileList.slice(index, index + step);
                    const filesName = files.map((f) => f.name).join('，')
                    // Keep progress monotonic even if we retry failed files.
                    files.forEach((f) => {
                        if (!progressState.processedOnce.has(f)) {
                            progressState.processedOnce.add(f)
                            progressState.done += 1
                            const percent = progressState.total
                                ? Math.min(100, Math.max(0, Math.round((progressState.done / progressState.total) * 100)))
                                : 0
                            setUploadProgress({ done: progressState.done, total: progressState.total, percent })
                        }
                    })
                    setLoadingContent(
                        `${t('uploading.now')}${filesName}\n` +
                        `${t('upload.progress', {
                            done: progressState.done,
                            total: progressState.total,
                            percent: progressState.total ? Math.round((progressState.done / progressState.total) * 100) : 0
                        })}`
                    );
                    currentSetFiles = files.map((f) => ({
                        name: f.name,
                        size: f.size,
                        type: f.type,
                        timeStamp,
                    }))

                    try {
                        const filesWithoutToken = files.filter((f) => !nameTokenMap.get(f.name));
                        if (filesWithoutToken.length) {
                            const tokens = await bitable.base.batchUploadFile(filesWithoutToken);

                            filesWithoutToken.forEach((f, i) => {
                                if (tokens[i]) {
                                    nameTokenMap.set(f.name, tokens[i]);
                                }
                            })
                        }
                        const cellValue = files.map((f, i) => {
                            const token = nameTokenMap.get(f.name);
                            if (!token) {
                                return null;
                            }
                            currentSetFiles[i].token = token;
                            return ({
                                token,
                                name: f.name,
                                size: f.size,
                                type: f.type,
                                timeStamp
                            });
                        }).filter((v) => !!v);

                        console.log("====cellValue", cellValue);

                        await table.addRecord({
                            fields: {
                                [fileFieldId]: cellValue.filter(Boolean) as IOpenAttachment[]
                            }
                        })
                    } catch (error) {
                        // message.warning(`发生错误，稍后将重试${error}`);
                        console.log('===error', error);
                        files.forEach((f) => {
                            failedFilesNameErrMap.set(f.name, String(error));
                        })
                        failedFiles.push(...files)
                    }
                }


            } catch (error) {
                message.error(`1 ${t('upload.error')}  ${error} \n\n${t('upload.error.files')}\n ${JSON.stringify(
                    currentSetFiles)}`)
            }
            if (failedFiles.length && remainTryTimes >= 1) {
                return loopUpload(failedFiles, nameTokenMap, remainTryTimes - 1)
            }
            return failedFiles;
        }

        if (uploadActionType === UploadFileActionType.AddNewRecord) {
            setLoading(true);
            setPreTable(undefined)
            setLoadingContent('');
            setUploadProgress(progressState.total > 0 ? { done: 0, total: progressState.total, percent: 0 } : null)

            const failedFiles = await loopUpload(fileList);
            if (failedFiles.length) {
                message.error(`2 ${t('upload.error')}\n\n${t('upload.error.files')}\n${failedFiles?.map((f: File) => `${f.name} : ${failedFilesNameErrMap.get(f.name)}`).join('，')}`);
            } else {
                message.success(t('upload.end'))

            }
            setLoading(false);
            setLoadingContent('')
            setUploadProgress(null)
            return;
        }

    }


    const onFinish = async () => {

        const { fileFieldId, compares, overWriteFile } = form.getFieldsValue();
        console.log('=== onFinish start', { tableId: currentSelection.tableId, viewId: currentSelection.viewId, fileFieldId, compares, overWriteFile, uploadActionType, fileCount: fileList.length })

        if (uploadActionType === UploadFileActionType.AddNewRecord) {
            console.log('=== onFinish uploadActionType AddNewRecord')
            return uploadAndAddNewRecord(fileList);
        }

        if (uploadActionType === UploadFileActionType.GetFileByName) {
            console.log('=== onFinish updateTableInfo start')
            const tableResult = await updateTableInfo(currentSelection, { loadRecords: true, forceReload: true }).catch((error) => {
                console.log('=== onFinish updateTableInfo error', error)
                message.error('updateTableInfo error:' + '\n' + String(error));
                throw error;
            });
            console.log('=== onFinish updateTableInfo done')
            const table = tableResult!.table
            const records = tableResult!.records
            tableInfo.current!.viewRecordIdList = tableResult!.viewRecordIdList
            const code = codeEditorValue.current
            //@ts-ignore
            window.pickFile = undefined;
            setLoading(true)
            setLoadingContent('')
            setUploadEnd(false)
            try {
                console.log('=== onFinish eval pickFile start')
                eval('window.pickFile =' + code.trim())
                //@ts-ignore
                if (typeof window.pickFile !== 'function') {
                    throw new Error()
                }
                console.log('=== onFinish eval pickFile done')
                //@ts-ignore
                const pickFile: (arg: any) => File[] = window.pickFile

                console.log('=== onFinish use current view records', { recordCount: records.length, viewId: currentSelection.viewId, tableId: currentSelection.tableId })
                console.log('=== onFinish build compare fields start', { compareFieldCount: compares?.length || 0 })
                const comparesFieldValueList: {
                    [fieldId: string]: {
                        [recordId: string]: IOpenCellValue
                    }
                } = Object.fromEntries(compares.map((fieldId: string) => {
                    console.log('=== onFinish build compare field', { fieldId })
                    const values = Object.fromEntries(records.map(({ recordId, fields }) => [recordId, fields[fieldId]]))
                    return [fieldId, values]
                }))
                console.log('=== onFinish build compare fields done')
                console.log('=== onFinish build file field values start', { fileFieldId })
                tableInfo.current!.exitFileValueList = Object.fromEntries(records.map(({ recordId, fields }) => {
                    return [recordId, fields[fileFieldId]]
                }))
                console.log('=== onFinish build file field values done', { valueCount: records.length })

                tableInfo.current!.comparesFieldValueList = comparesFieldValueList
                try {
                    console.log('=== onFinish build preview start')
                    setLoadingContent(t('is.matching'))
                    setLoading(true)

                    setTimeout(() => {
                        try {
                            console.log('=== onFinish matching records start', { recordCount: tableInfo.current?.viewRecordIdList?.length || 0 })
                            tableInfo.current?.viewRecordIdList.map((recordId) => {
                                const currentFileFieldValue = tableInfo.current?.exitFileValueList[recordId]
                                // 和所选一样的顺序
                                const compareValues = compares.map((fieldId: string) => comparesFieldValueList[fieldId][recordId])
                                const files = pickFile({ fileList, compareValues, currentValue: currentFileFieldValue }) || []

                                if (!overWriteFile) {
                                    if (currentFileFieldValue) {
                                        recordFiles.set(recordId, undefined)
                                    } else {
                                        recordFiles.set(recordId, files?.length ? files : null)
                                    }
                                } else {
                                    recordFiles.set(recordId, files?.length ? files : null)
                                }
                            })
                            console.log('=== onFinish matching records done')
                            console.log('=== onFinish build preview table start')
                            setPreTable(
                                getPreviewTable({
                                    fieldsMetaList: fieldMetaList!,
                                    fileFieldId,
                                    recordFiles,
                                    allRecordsIds: tableInfo.current?.viewRecordIdList!,
                                    compares,
                                    overWriteFile,
                                    exitFileValueList: tableInfo.current!.exitFileValueList,
                                    comparesFieldValueList
                                })
                            )
                            console.log('=== onFinish build preview table done')



                            setPreTableFitForm(true)

                            setLoadingContent('')
                            setTimeout(() => {
                                console.log('=== onFinish loading end')
                                setLoading(false);
                            }, 1000);
                        } catch (error) {
                            console.log('=== onFinish build preview error', error)
                            message.error(t('function.errot') + '\n' + String(error))
                            setLoading(false);
                            setLoadingContent('')
                        }

                    });


                } catch (error) {
                    console.log('=== onFinish build preview schedule error', error)
                    message.error(t('function.errot') + '\n' + String(error))
                    setLoading(false);
                    setLoadingContent('')

                }


                // const 
            } catch (error) {
                console.log('=== onFinish declare pickFile error', error)
                message.error(t('function.dealare.error') + '\n' + String(error))
                setLoadingContent('')
                setLoading(false)
            }
        }
    }


    if (!tableInfo.current) {
        return <div className='suspense-loading'>
            <div className="lds-roller"><div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div></div>
        </div>
    }
    return (
        <div>
            <Spin
                tip={loadingContent}
                spinning={loading}
            >

                <div id='container' className='container'>
                    <div style={{ marginBottom: 12, border: '1px solid #f0f0f0', padding: 12, borderRadius: 4, background: '#fafafa' }}>
                        {t('current.processing', {
                            tableName: currentLocation.tableName || currentLocation.tableId,
                            viewName: currentLocation.viewName || currentLocation.viewId,
                        })}
                    </div>
                    {loading && uploadProgress && uploadProgress.total > 0 && (
                        <div style={{ marginBottom: 12 }}>
                            <Progress percent={uploadProgress.percent} size="small" />
                        </div>
                    )}
                    <Form
                        onFinish={onFinish}
                        form={form}>
                        <Form.Item style={{ marginBottom: '0' }} label={t('choose.mode')}>
                            <ChooseTemp onChange={(v) => setUploadActionType(v)} />
                        </Form.Item>

                        <div key={uploadActionType}>
                            {uploadActionType === UploadFileActionType.GetFileByName && (
                                <>
                                    <Form.Item
                                        name='compares'
                                        tooltip={t('compares.tooltip')}
                                        initialValue={[fieldMetaList?.[0]?.id]}
                                        label={t('select.pickField')}>
                                        <Select
                                            mode='multiple'
                                            options={fieldMetaList?.map(({ id, name, type }) => ({
                                                label:
                                                    // @ts-ignore
                                                    <div className='filedIconContainer'>{fieldIcons[type]} {name}</div>,
                                                value: id
                                            }))}
                                        >
                                        </Select>
                                    </Form.Item>
                                    <div style={{ marginBottom: 12, border: '1px solid #f0f0f0', padding: 12, borderRadius: 4, background: '#fafafa' }}>
                                        <Form.Item label={t('rule.select')} style={{ marginBottom: 12 }}>
                                            <Select
                                                style={{ width: '100%' }}
                                                value={currentRuleId}
                                                onChange={handleRuleChange}
                                                options={[
                                                    { label: t('rule.default'), value: 'default' },
                                                    ...savedRules.map(r => ({ label: r.name, value: r.id }))
                                                ]}
                                            />
                                        </Form.Item>
                                        <Form.Item label={t('rule.name')} style={{ marginBottom: 12 }} required={currentRuleId === 'default'}>
                                            <Input
                                                placeholder={currentRuleId === 'default' ? t('rule.name.placeholder.new') : t('rule.name.placeholder.edit')}
                                                value={ruleName}
                                                onChange={e => setRuleName(e.target.value)}
                                            />
                                        </Form.Item>
                                        <Space>
                                            <Button type='primary' icon={
                                                // @ts-ignore
                                                <SaveOutlined />
                                            } onClick={handleSaveRule}>
                                                {currentRuleId === 'default' ? t('rule.create') : t('rule.update')}
                                            </Button>
                                            <Button icon={
                                                // @ts-ignore
                                                <CopyOutlined />
                                            } onClick={handleSaveAsRule}>
                                                {t('rule.save.as')}
                                            </Button>
                                            {currentRuleId !== 'default' && (
                                                <Popconfirm title={t('rule.delete')} onConfirm={handleDeleteRule}>
                                                    <Button icon={
                                                        // @ts-ignore
                                                        <DeleteOutlined />
                                                    } danger>
                                                        {t('rule.delete')}
                                                    </Button>
                                                </Popconfirm>
                                            )}
                                        </Space>
                                    </div>
                                    <Collapse size='small' items={[{
                                        key: '1', label: t('pickFile.label'),
                                        children: <Editor
                                            key={currentRuleId}
                                            defaultValue={codeEditorValue.current}
                                            onChange={(v) => { codeEditorValue.current = v }} />
                                    }]} defaultActiveKey={['-1']} />
                                    <br />
                                    <Form.Item initialValue={['\n']} rules={[{ required: true }]}
                                        tooltip={t('self.reg.tooltip')} label={t('self.reg')}>

                                        <Checkbox.Group
                                            onChange={(v) => {
                                                if (!v || !v?.length) {
                                                    // @ts-ignore
                                                    window._reg = /[]+/g
                                                    return;
                                                }
                                                // @ts-ignore
                                                window['_reg'] = new RegExp(`[${v.join('')}]+`, 'g')
                                            }}
                                            defaultValue={['\n']}
                                            options={[
                                                { label: t('space'), value: ' ' },
                                                { label: t('e'), value: '\n' },
                                                { label: '#', value: '#' },
                                                { label: '\\', value: '\\\\' },
                                                { label: '/', value: '/' },
                                                { label: '|', value: '|' },
                                                { label: '，', value: '，' },
                                                { label: '；', value: '；' },
                                                { label: ';', value: ';' },
                                                { label: ',', value: ',' },

                                            ]}>

                                        </Checkbox.Group>
                                    </Form.Item>
                                </>
                            )}
                        </div>






                        {/* 选择附件字段 */}
                        <Form.Item
                            rules={[{ required: true }]}
                            name='fileFieldId'
                            initialValue={fieldMetaList?.find(({ type }) => type === FieldType.Attachment)?.id} label={t('select.fileFieldId')}>
                            <Select
                                onChange={() => setPreTableFitForm(false)}
                                options={fieldMetaList?.filter(({ type }) => type === FieldType.Attachment).map(({ id, name }) => ({ label: name, value: id }))}
                            >
                            </Select>
                        </Form.Item>




                        <div className='space-around'>
                            {/* 默认覆盖已有附件 */}
                            <Form.Item
                                name='overWriteFile'
                                valuePropName='checked'
                                label={t('overWrite.exit.file')}
                                hidden={uploadActionType === UploadFileActionType.AddNewRecord}
                                initialValue={false}>
                                <Switch onChange={() => {
                                    setPreTableFitForm(false)
                                }}></Switch>
                            </Form.Item>

                            <div className='fileUploadContainer'>
                                <div className='fileInput'>
                                    <input draggable id='filesInput' type='file' multiple onChange={(e) => {
                                        const filteredFiles = [...e.target.files || []].filter((f) => f.size && f.name);
                                        setFileList(filteredFiles);
                                        setPreTableFitForm(false)
                                    }}></input>

                                </div>
                                <div className='fileInputMask'>
                                    <div className='uploadIcon'>
                                        <CloudUploadOutlined onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined} />
                                    </div>
                                    <div>
                                        {fileList.length ? <span style={{ color: '#1890ff' }}>{t('selected.num.file', { num: fileList.length })}</span> : t('please.choose.file')}
                                    </div>
                                </div>
                            </div>

                        </div>

                        <Form.Item rules={[{ required: true }]}>
                            {uploadActionType === UploadFileActionType.GetFileByName && <div id='btnsContainer' className='btnsContainer'>


                                <SubmitButton text={t('btn.preview')} disabled={!fileList.length} form={form}></SubmitButton>
                                {PreTable && preTableFitForm && <Button
                                    disabled={uploadEnd}
                                    type='primary'
                                    onClick={onClickUpload}>
                                    {uploadEnd ? t('upload.end') : t('upload.file')}
                                </Button>}
                            </div>}
                            {
                                uploadActionType === UploadFileActionType.AddNewRecord && <SubmitButton
                                    disabled={!fileList.length}
                                    text={t('btn.add.upload.file')}
                                    form={form}></SubmitButton>
                            }
                        </Form.Item>
                    </Form>



                    <br id='preTablePosition'>
                    </br>


                    {uploadActionType === UploadFileActionType.GetFileByName && PreTable}
                </div>
            </Spin>
        </div>
    )
}


const SubmitButton = ({ form, disabled, text }: { form: FormInstance, disabled?: boolean, text: string }) => {
    const [submittable, setSubmittable] = React.useState(false);

    // Watch all values
    const values = Form.useWatch([], form);

    React.useEffect(() => {
        form.validateFields({ validateOnly: true }).then(
            () => {
                setSubmittable(true);
            },
            () => {
                setSubmittable(false);
            },
        );
    }, [values]);

    return (
        <Button htmlType="submit" disabled={disabled || !submittable}>
            {/* 预览 */}
            {text}
        </Button>
    );
};

// 预览table
function getPreviewTable({ fieldsMetaList, fileFieldId, allRecordsIds, compares, comparesFieldValueList, recordFiles, overWriteFile,
    exitFileValueList, }: {
        fieldsMetaList: IFieldMeta[],
        fileFieldId: string,
        compares: string[],
        recordFiles: Map<string, { name: string }[] | null | undefined>
        allRecordsIds: string[],
        // 所用到的值列表
        comparesFieldValueList: {
            [fieldId: string]: {
                [recordId: string]: IOpenCellValue
            }
        },
        overWriteFile: boolean,
        exitFileValueList: {
            [recordId: string]: IOpenCellValue
        },
    }) {

    if (!compares || !fileFieldId || !fieldsMetaList || !comparesFieldValueList || !allRecordsIds) {
        return null
    }
    const columns: any[] = fieldsMetaList.filter(({ id }) => compares.includes(id)).map(({ name, id }) => ({
        title: name, // 比较字段
        dataIndex: id,
        key: id,
        render: (cell: any) => getTalbeCellString(cell) //TODO
    }))
    columns.push({
        title: fieldsMetaList.find(({ id }) => fileFieldId === id)!.name, // 附件字段
        dataIndex: fileFieldId,
        key: fileFieldId,
        fixed: 'right',
        width: 250,
        render: (cell: any) => {
            // When getRecordsByPage({ stringValue: true }) is used, some fields may become strings.
            if (Array.isArray(cell)) {
                const names = cell
                    .map((file: any) => file?.name ?? file?.text ?? file?.fullAddress ?? file?.url ?? file?.email ?? '')
                    .filter(Boolean)
                    .join('\n')
                return <div className='tableCell'>{names}</div>
            }
            return <div className='tableCell'>{getTalbeCellString(cell)}</div>
        }
    })

    const dataSource = allRecordsIds.map((recordId: string) => {
        const comparesFields = compares.map((fieldId) => [fieldId, comparesFieldValueList[fieldId][recordId]])
        let fileFields: [string, any] = [fileFieldId, recordFiles.get(recordId)]
        if (!overWriteFile && exitFileValueList[recordId]) {
            fileFields = [fileFieldId, exitFileValueList[recordId]]
        }
        return Object.fromEntries(comparesFields.concat([fileFields as any]))
    })

    return <Table scroll={{ x: window.innerWidth + columns.length * 100, y: window.innerHeight - 100 }} dataSource={dataSource} columns={columns} pagination={{ position: ['bottomRight'] }}></Table>
}


function getTalbeCellString(cell: IOpenCellValue) {
    if (Array.isArray(cell)) {
        //@ts-ignore
        return cell.map(({ name, text, fullAddress, email, url }) => text || fullAddress || name || url || email || '').join('')
    }
    if (typeof cell === 'object' && cell) {
        //@ts-ignore
        return cell.text || cell.fullAddress || cell.link || cell.name || ''
    }
    return String(cell ?? '')
}
//@ts-ignore
window.getTalbeCellString = getTalbeCellString


function createRegexFromString(str: string) {
    const regexParts = str.trim().match(/\/(.*)\/([gimyus]{0,6})/);

    if (regexParts && regexParts.length >= 3) {
        const pattern = regexParts[1];
        const flags = regexParts[2];

        const regex = new RegExp(pattern, flags);

        return regex;
    } else {
        throw new Error('Invalid regular expression string');
    }
}

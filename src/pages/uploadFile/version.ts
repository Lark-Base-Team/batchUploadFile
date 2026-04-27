export const oldVersion = {
    /** 判断当前是飞书还是lark：域名含有devx,则是lark，否则是feishu */
    feishu: 'https://ext.baseopendev.com/ext/Lark-Base-Team_batchUploadFile_1773716255708_995/1773716278174/index.html',
    lark: 'https://ext.baseopendevx.com/ext/Lark-Base-Team_batchUploadFile_1773716255708_995/1773716278174/index.html',
}

export function getCurrentVersion() {
    return window.location.hostname.includes('devx') ? oldVersion.lark : oldVersion.feishu
}
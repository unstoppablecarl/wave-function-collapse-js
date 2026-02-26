import { BindingApi } from '@tweakpane/core'

export function addInfo(target: BindingApi, message: string) {
  const labelEl = target.controller.view.element.querySelector('.tp-lblv_l') as HTMLElement
  labelEl.title = message
}

export function enumToOptions(target: Record<any, any>) {
  return Object.values(target)
    .filter(v => typeof v === 'number')
    .map((v) => {
      return {
        value: v,
        text: target[v as unknown as number],
      }
    })
}
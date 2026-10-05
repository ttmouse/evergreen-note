import { deepClone } from './deepClone'

export const powerObj = {
  set(data: Object, k: string, v: unknown) {
    const keys = k.split('.')
    const newData = deepClone(data)
    let d = newData
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (d[key] === undefined) {
        d[key] = {}
      }
      d = d[key]
    }
    d[keys[keys.length - 1]] = v
    return newData
  },

  get(data: Object, k: string) {
    const keys = k.split('.')
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]
      if (data[key] === undefined) {
        return undefined
      }
      data = data[key]
    }
    return data
  },

  push(data: Object, k: string, v: unknown) {
    const keys = k.split('.')
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (data[key] === undefined) {
        data[key] = {}
      }
      data = data[key]
    }
    const key = keys[keys.length - 1]
    if (data[key] === undefined) {
      data[key] = []
    }
    data[key].push(v)
  },

  pop(data: Object, k: string) {
    const keys = k.split('.')
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i]
      if (data[key] === undefined) {
        data[key] = {}
      }
      data = data[key]
    }
    const key = keys[keys.length - 1]
    if (data[key] === undefined) {
      data[key] = []
    }
    return data[key].pop()
  },
}

// const item = {
//   reminder: {
//     plans: [
//       {
//         repeatPlan: 'one',
//         targetDate: '2021-08-31T16:00:00.000Z',
//       },
//     ],
//   },
// };

// powerObj
//   .set(item, 'reminder.plans.0.repeatPlan', 'interval')
//   .set(item, 'reminder.plans.2.stepUnit', 'day')
//   .set(item, 'reminder.age', 30);

// const a = powerObj.pop(item, 'reminder.plans');
// console.log(a, item);

/**
 * 练习工具函数
 */

// 计算 WPM (每分钟字数) - 标准定义：每5字符=1词
export function calcWpm(correctChars: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  const minutes = durationMs / 60000
  return Math.round((correctChars / 5) / minutes)
}

// 计算准确率
export function calcAccuracy(correct: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((correct / total) * 1000) / 10
}

// 比较输入与目标，返回逐字符正确性
export interface CharCompare {
  expected: string
  actual: string | null
  correct: boolean
}

export function compareTexts(target: string, input: string): CharCompare[] {
  const result: CharCompare[] = []
  const targetArr = [...target]
  const inputArr = [...input]
  for (let i = 0; i < targetArr.length; i++) {
    const expected = targetArr[i]
    const actual = i < inputArr.length ? inputArr[i] : null
    result.push({
      expected,
      actual,
      correct: actual === expected,
    })
  }
  return result
}

// 统计错误字符列表
export function getErrorChars(target: string, input: string): string[] {
  const errors: string[] = []
  const targetArr = [...target]
  const inputArr = [...input]
  for (let i = 0; i < targetArr.length; i++) {
    if (i >= inputArr.length) {
      errors.push(targetArr[i])
    } else if (inputArr[i] !== targetArr[i]) {
      errors.push(targetArr[i])
    }
  }
  return errors
}

// 键位映射：键→对应手指
export const KEY_TO_FINGER: Record<string, string> = {
  // 左手
  '1': 'L-pinky', 'q': 'L-pinky', 'a': 'L-pinky', 'z': 'L-pinky',
  '2': 'L-ring', 'w': 'L-ring', 's': 'L-ring', 'x': 'L-ring',
  '3': 'L-middle', 'e': 'L-middle', 'd': 'L-middle', 'c': 'L-middle',
  '4': 'L-index', 'r': 'L-index', 'f': 'L-index', 'v': 'L-index',
  '5': 'L-index', 't': 'L-index', 'g': 'L-index', 'b': 'L-index',
  // 右手
  '6': 'R-index', 'y': 'R-index', 'h': 'R-index', 'n': 'R-index',
  '7': 'R-index', 'u': 'R-index', 'j': 'R-index', 'm': 'R-index',
  '8': 'R-middle', 'i': 'R-middle', 'k': 'R-middle', ',': 'R-middle',
  '9': 'R-ring', 'o': 'R-ring', 'l': 'R-ring', '.': 'R-ring',
  '0': 'R-pinky', 'p': 'R-pinky', ';': 'R-pinky', '/': 'R-pinky',
  ' ': 'thumb',
}

export const FINGER_NAMES: Record<string, string> = {
  'L-pinky': '左手小指',
  'L-ring': '左手无名指',
  'L-middle': '左手中指',
  'L-index': '左手食指',
  'R-index': '右手食指',
  'R-middle': '右手中指',
  'R-ring': '右手无名指',
  'R-pinky': '右手小指',
  'thumb': '大拇指',
}

// 键盘布局（标准 QWERTY）
export const KEYBOARD_ROWS = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l',';'],
  ['z','x','c','v','b','n','m',',','.','/'],
]

// 基准键位
export const HOME_ROW = ['a','s','d','f','j','k','l',';']

// 键盘练习关卡配置
export const KEYBOARD_LEVELS = [
  {
    level: 1,
    title: '基准键位',
    description: 'ASDF JKL; 八指归位，建立肌肉记忆',
    keys: ['a','s','d','f','j','k','l',';'],
    exercises: [
      'asdf jkl;',
      'asdf jkl; asdf jkl;',
      'aa ss dd ff jj kk ll ;;',
      'ask all dad fall ask less',
      'sad lad jazz flask',
    ],
    passWpm: 10,
    passAccuracy: 95,
  },
  {
    level: 2,
    title: '上排键位',
    description: 'QWERTYUIOP 手指上移归位',
    keys: ['q','w','e','r','t','y','u','i','o','p'],
    exercises: [
      'qwertyuiop',
      'qwer tyui op',
      'we are we are',
      'type write quite',
      'pretty require output',
    ],
    passWpm: 15,
    passAccuracy: 92,
  },
  {
    level: 3,
    title: '下排键位',
    description: 'ZXCVBNM,./ 手指下移归位',
    keys: ['z','x','c','v','b','n','m',',','.','/'],
    exercises: [
      'zxcv bnm,./',
      'zz xx cc vv bb nn mm ,, .. //',
      'can box van cob',
      'zoom next comic',
      'between compare subject',
    ],
    passWpm: 18,
    passAccuracy: 90,
  },
  {
    level: 4,
    title: '数字键',
    description: '1234567890 双行上移',
    keys: ['1','2','3','4','5','6','7','8','9','0'],
    exercises: [
      '1234567890',
      '12 34 56 78 90',
      '1024 2024 365',
      '1st 2nd 3rd 4th',
      'room 101 floor 5',
    ],
    passWpm: 20,
    passAccuracy: 88,
  },
  {
    level: 5,
    title: '符号键',
    description: ',.?!\'":; Shift 组合',
    keys: [',','.','?','!',"'",'"',':',';'],
    exercises: [
      'hello, world!',
      'what? why! how?',
      '"yes," she said.',
      "it's a test: pass;",
      'one, two; three!',
    ],
    passWpm: 22,
    passAccuracy: 88,
  },
  {
    level: 6,
    title: '大小写综合',
    description: 'Shift 大写、长句综合训练',
    keys: ['shift','capslock'],
    exercises: [
      'Hello World',
      'I am a Student in China.',
      'The Quick Brown Fox Jumps.',
      'My name is Li Ming. I am 12.',
      'In 2024, we visited Beijing and Shanghai.',
    ],
    passWpm: 25,
    passAccuracy: 90,
  },
]

import source from './Dictionary/Dictionary'

export const getRandomLetterOrSpace = () => {
    let result = ' '
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ.!?"
    let fullAlphabet = `${alphabet}${alphabet.toLocaleLowerCase()}`
    result = fullAlphabet[Math.floor(Math.random() * fullAlphabet.length)]
    // console.log(`Random letter ${result}`)
    return result
}
const notValidList = ["undefined", " ", "-"]
const checkIfLetterValid = (letter: string): boolean => {
    let valid = false
    if (notValidList.indexOf(letter) !== -1) {
        valid = true
    }
    return valid
}

export class DictionaryTools {
    dict: any
    commonLetterPairs: any = {}
    letterPairs: any[] = []
    letterPairsWithFreq: any[] = []
    letterPairToFreqLookup: any = {}
    constructor() {
        this.dict = source
        // this.dict.sort((entry1: string, entry 2: string))
        Object.keys(this.dict).join(' ').split('').forEach((letter: string, index: number, array: string[]) => {
            //if on last letter don't do anything with it
            if (index === array.length ||
                checkIfLetterValid(letter) ||
                checkIfLetterValid(array[index + 1])
            ) return
            //key the letter pair for current letter and next letter
            let key = `${letter}${array[index + 1]}`.toLocaleLowerCase()
            let result = this.commonLetterPairs[key]
            if (result) {
                this.commonLetterPairs[key] += 1
            } else {
                this.commonLetterPairs[key] = 1
            }
        }, {})
        this.commonLetterPairs = Object.entries(this.commonLetterPairs).sort((item1: any, item2: any) => {
            if (item1[1] > item2[1]) {
                return -1
            } else if (item1[1] < item2[1]) {
                return 1
            } else {
                return 0
            }
        }).forEach((item:any) => {
            this.letterPairs.push(item[0])
            this.letterPairsWithFreq.push(`LetterPair: ${item[0]} ${item[1]}`)
            this.letterPairToFreqLookup[item[0]] = item[1]
            return item
        })
        const shouldLog = false
        if(shouldLog){
            console.log("Freq")
            console.log(this.letterPairsWithFreq)
            console.log("letterPairs")
            console.log(this.letterPairs)
            console.log(this.letterPairs.length)
        }
    }

}
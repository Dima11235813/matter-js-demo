// import source from './Dictionary/scribdDict'
// import source from './Dictionary/corporaExplitives'
import source from './Dictionary/combinationOfAllDict'
import { letterFreqLookupRatio } from './letterFreqLookupSource'
// import source from './Dictionary/googleMostCommonDict'
// import source from './Dictionary/Dictionary'


export const getRandomWeightedLetterCreator = () => {
    let sum = Math.floor(Object.values(letterFreqLookupRatio).reduce((accum: number, current: number) => {
        return accum + current
    }))
    let weightedLetters = Object.entries(letterFreqLookupRatio) as [string, number][];
    weightedLetters.sort((letterAndFreq1: [string, number], letterAndFreq2: [string, number]) => {
        let ratio1 = letterAndFreq1[1]
        let ratio2 = letterAndFreq2[1]
        if (ratio1 < ratio2) {
            return -1
        } else if (ratio2 < ratio1) {
            return 1
        } else return 0
    })
    // console.log("weightedLetters")
    // console.log(weightedLetters)
    const getLetterForRandomWeight = (randomDigitWithWeight: number) : string => {
        let randomLetter = ""
        let accum = 0
        let foundLetter = false
        //see if stopping execution with do while will improve perf significantly enough
        weightedLetters.forEach((letterAndFreq: [string, number]) => {
            let letter = letterAndFreq[0]
            let ratio = letterAndFreq[1]
            accum += ratio
            if(!foundLetter && accum >= randomDigitWithWeight){
                randomLetter = letter
                foundLetter = true
            }
        })
        // console.log(`
        // Random letter 
        // ${randomLetter}
        // Value 
        // ${accum}
        // `)
        return randomLetter
    }
    return () => {
        let randomDigitWithWeight = Math.floor(Math.random() * sum)
        // console.log(`Generated random digits ${randomDigitWithWeight} while sum is ${sum}`)
        return getLetterForRandomWeight(randomDigitWithWeight)
    }
}

export const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const randLetterGen = getRandomWeightedLetterCreator()
export const getRandomLetterOrSpace = () => {
    let nextRandLetter = randLetterGen()
    // console.log(`${nextRandLetter} Random letter generated`)
    return nextRandLetter
    let result = ' '
    // let fullAlphabet = `${alphabet}${alphabet.toLocaleLowerCase()}`
    let fullAlphabet = alphabet.toLocaleLowerCase()
    result = fullAlphabet[Math.floor(Math.random() * fullAlphabet.length)]
    // console.log(`Random letter ${result}`)
    return result
}
const notValidList = [" ", "-", ".", "!", "*", "$", "_", "0", "@", "'", "`"]
const checkIfLetterNotValid = (letter: string): boolean => {
    let valid = false
    if (notValidList.indexOf(letter) !== -1) {
        valid = true
    }
    return valid
}
//TODO Move to constants class
//whatever this is plus 1
export const sizeOfLargestWord = 10

const checkIfDynamicKeysCharsNotValid = (index: number, array: string[]): boolean => {
    let longestKeyIsNotValid = false
    let endOfIndexForLongestWord = Math.min(index + sizeOfLargestWord + 2, array.length - 1)
    let longestPossibleKey = array.slice(index, endOfIndexForLongestWord)
    longestPossibleKey.forEach(char => {
        if (notValidList.indexOf(char) > -1) {
            longestKeyIsNotValid = true
        }
    })
    return longestKeyIsNotValid
}

export class DictionaryTools {
    dict: Record<string, number>
    commonLetterPairs: Record<string, number> = {}
    letterPairs: string[] = []
    letterPairsWithFreq: string[] = []
    letterPairToFreqLookup: Record<string, number> = {}

    letterCombos: Record<string, number>[] = []
    letterComboWithFreq: Record<string, number>[] = []
    letterComboToFreqLookup: Record<string, number> = {}

    arrayOfKeys: string[] = []
    wordLookup: Map<string, number> = new Map<string, number>()
    constructor() {
        const arrayOfLetterComboLookUps: Record<string, number>[] = []
        this.dict = source
        this.initializeWordLookup()
        this.processLetterCombinations(arrayOfLetterComboLookUps)
        this.sortAndPopulateCombinations(arrayOfLetterComboLookUps)
    }

    private initializeWordLookup(): void {
        Object.keys(this.dict).forEach(word => {
            if (word.length > 1) {
                let isValid = true
                notValidList.forEach(char => {
                    if (word.indexOf(char) > -1) {
                        isValid = false
                    }
                })
                if (isValid) {
                    this.wordLookup.set(word.toLowerCase(), 1)
                }
            }
        })
    }

    private processLetterCombinations(arrayOfLetterComboLookUps: Record<string, number>[]): void {
        Object.keys(this.dict)
            .join(' ')
            .split('')
            .forEach((letter: string, index: number, array: string[]) => {
                if (index === array.length) return
                if (checkIfLetterNotValid(letter) || checkIfLetterNotValid(array[index + 1])) return

                let key = `${letter}${array[index + 1]}`.toLowerCase()
                this.arrayOfKeys = this.getArrayOfKeys(letter, index, array)
                this.arrayOfKeys.forEach((key: string) => {
                    if (!arrayOfLetterComboLookUps[key.length]) {
                        arrayOfLetterComboLookUps[key.length] = {}
                    }
                    const currentLookup = arrayOfLetterComboLookUps[key.length]
                    if (!currentLookup[key]) {
                        currentLookup[key] = 1
                    } else {
                        currentLookup[key] += 1
                    }
                })

                let result = this.commonLetterPairs[key]
                if (result) {
                    this.commonLetterPairs[key] += 1
                } else {
                    this.commonLetterPairs[key] = 1
                }
            }, {})
    }

    private sortAndPopulateCombinations(arrayOfLetterComboLookUps: Record<string, number>[]) : void {
        Object.entries(this.commonLetterPairs).sort((item1: [string, number], item2: [string, number]) => {
            if (item1[1] > item2[1]) return -1
            if (item1[1] < item2[1]) return 1
            return 0
        }).forEach((item: [string, number]) => {
            this.letterPairs.push(item[0])
            this.letterPairsWithFreq.push(`LetterPair: ${item[0]} ${item[1]}`)
            this.letterPairToFreqLookup[item[0]] = item[1]
        })

        const sortedLetterComboLookUps = arrayOfLetterComboLookUps.map((keys) => {
            return Object.entries(keys).sort((item1: [string, number], item2: [string, number]) => {
                if (item1[1] > item2[1]) return -1
                if (item1[1] < item2[1]) return 1
                return 0
            })
        })

        sortedLetterComboLookUps.forEach((sortedArray: [string, number][]) => {
            sortedArray.forEach((letterComboArray: [string, number]) => {
                let letterCombo: string = letterComboArray[0]
                let numberOfInstances: number = letterComboArray[1]
                let lenghtOfLetterCombo: number = letterCombo.length
                if (!this.letterComboWithFreq[lenghtOfLetterCombo]) {
                    this.letterComboWithFreq[lenghtOfLetterCombo] = {}
                }
                if (!this.letterComboWithFreq[lenghtOfLetterCombo][letterCombo]) {
                    this.letterComboWithFreq[lenghtOfLetterCombo][letterCombo] = numberOfInstances
                }
                if (!this.letterCombos[lenghtOfLetterCombo]) {
                    this.letterCombos[lenghtOfLetterCombo] = {}
                }
                if (!this.letterCombos[lenghtOfLetterCombo][letterCombo]) {
                    this.letterCombos[lenghtOfLetterCombo][letterCombo] = numberOfInstances
                }
            })
        })
    }
    getArrayOfKeys = (letter: string, index: number, array: string[]): string[] => {
        let arrayOfKeys = new Array(sizeOfLargestWord).fill("").map((_: string, indexForKey: number) => {
            let lengthOfKey = indexForKey + 2
            //check new key for not allowed chars
            let key = array.slice(index, index + lengthOfKey).join('').toLowerCase()
            notValidList.forEach((notValidChar: string) => {
                if (key.indexOf(notValidChar) > -1) {
                    key = ""
                }
            })
            return key
            //don't return keys that are one letter or empty strings
        })
        arrayOfKeys = arrayOfKeys.filter(key => {
            let keyIsntBlankString = key !== ""
            let keyIsntOneLetter = key.length !== 1
            return keyIsntOneLetter && keyIsntBlankString
        })
        return arrayOfKeys
    }

}
export const getRandomLetterOrSpace = () => {
    let result = ' '
    let alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    let fullAlphabet = `${alphabet}${alphabet.toLocaleLowerCase()}`
    result = fullAlphabet[Math.floor(Math.random() * fullAlphabet.length)]
    // console.log(`Random letter ${result}`)
    return result
}
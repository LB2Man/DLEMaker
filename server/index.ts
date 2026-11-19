import express from 'express'

const app = express()

app.get('/', (request, response) => {
    response.send('DLEMaker backend is running')
})

app.listen(3001, () => {
    console.log('Backend running at http://localhost:3001')
})
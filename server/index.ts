import express from 'express'
import pg from 'pg'
import { json } from 'stream/consumers'

const app = express()
app.use(express.json())

const pool = new pg.Pool()

pool.query('SELECT current_database()')
.then (result => {
    console.log('Connected to database:', result.rows[0].current_database)
})
.catch(error => {
    console.error('database connection error:', error.message)
})


app.get('/', (request, response) => {
    response.send('DLEMaker backend is running')
})
app.post('/dles', async (request, response) => {
    const dle = request.body
    try{
        const result = await pool.query(
            `INSERT INTO dles (name , categories, characters)
            VALUES ($1, $2, $3) 
            RETURNING id, name`,
            [
                dle.name,
                JSON.stringify(dle.categories),
                JSON.stringify(dle.characters),
            ]
        )
        response.status(201).json({
            message: 'DLE saved',
            dle: result.rows[0],
        
        })
    } catch (error) {
        console.error('could not save DLE', error)

        response.status(500).json({
            message: 'Could not save DLE',
        })
    }
})
app.listen(3001, () => {
    console.log('Backend running at http://localhost:3001')
})
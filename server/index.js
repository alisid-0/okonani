import 'dotenv/config'
import { createStripeApp } from './createApp.js'

const port = Number(process.env.PORT ?? 3001)

const app = createStripeApp()

app.listen(port, () => {
  console.log(`Stripe API listening on http://localhost:${port}`)
})

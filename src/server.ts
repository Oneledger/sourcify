import express from 'express';
import serveIndex from 'serve-index';
import fileUpload from 'express-fileupload';
import cors from 'cors';
import Injector from './injector';
import Logger from 'bunyan';
import {
  findInputFiles,
  InputData,
  sanitizeInputFiles,
  findByAddress,
  errorMiddleware,
  Match
} from "./utils";


const app = express();

let localChainUrl;

if (process.env.TESTING) {
  localChainUrl = process.env.LOCALCHAIN_URL;
}

const log = Logger.createLogger({
  name: "Server",
  streams: [{
    stream: process.stdout,
    level: 30
  }]
});

const injector = new Injector({
  localChainUrl: localChainUrl,
  log: log
});

const repository = process.env.MOCK_REPOSITORY || './repository';
const port = process.env.SERVER_PORT;

app.use(express.static('ui/dist'))

// TODO: 52MB is the max file size - is this right?
app.use(fileUpload({
  limits: {fileSize: 50 * 1024 * 1024},
  abortOnLimit: true
}))

app.use(cors())

/* tslint:disable:no-unused-variable */
app.get('/', (req, res) => res.sendFile('ui/dist/index.html'))
app.get('/health', (req, res) => res.status(200).send('Alive and kicking!'))
app.use('/repository', express.static(repository), serveIndex(repository, {'icons': true}))

/* tslint:enable:no-unused-variable */

app.post('/', (req, res, next) => {

  const inputData: InputData = {
    repository: repository,
    files: [],
    addresses: [req.body.address],
    chain: req.body.chain,
  }

  // Try to find by address, return on success.
  try {
    const result = findByAddress(req.body.address, req.body.chain, repository);
    res.status(200).send({result});
    return;
  } catch(err) {
    const msg = "Could not find file in repository, proceeding to recompilation"
    log.info({loc:'[POST:VERIFICATION_BY_ADDRESS_FAILED]'}, msg);
  }

  // Try to organize files for submission, exit on error.
  try {
    const files = findInputFiles(req, log);
    inputData.files = sanitizeInputFiles(files, log);
  } catch (err) {
    return next(err);
  }

  // Injection
  const promises: Promise<Match>[] = [];
  promises.push(injector.inject(inputData));

  //This is so we can have multiple parallel injections, logic still has to be completely implemented
  Promise.all(promises).then((result) => {
    res.status(200).send({result});
  }).catch(err => {
    next(err); // Just forward it to error middelware
  })
})

app.use(errorMiddleware);

app.listen(port, () => log.info({loc: '[LISTEN]'}, `Injector listening on port ${port}!`))

export default app;

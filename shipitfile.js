module.exports = shipit => {
    require('shipit-deploy')(shipit)
    require('shipit-shared')(shipit)
    require('dotenv').config()

    const appName = 'strapi-blog-test'

    shipit.initConfig({
        default: {
            deployTo: '/home/deploy/' + appName,
            repositoryUrl: 'https://github.com/kmorning/strapi-blog-test.git',
            branch: 'main',
            keepReleases: 5,
            shallowClone: true,
            shared: {
                overwrite: true,
                dirs: ['node_modules']
            }
        },
        production: {
            servers: 'deploy@192.168.2.4'
        }
    })

    const path = require('path')

    const ecosystemFilePath = path.join(
        shipit.config.deployTo,
        'shared',
        'ecosystem.config.js'
    )

    // listeners
    shipit.on('updated', async () => {
        shipit.start('install-modules', 'copy-config', 'copy-build')
    })

    shipit.on('published', async () => {
        shipit.start('pm2-server')
    })

    // tasks
    shipit.blTask('install-modules', async () => {
        shipit.remote(`cd ${shipit.releasePath} && yarn install --production`)
    })

    shipit.blTask('copy-config', async () => {
        const fs = require('fs')

        const ecosystem = `
        module.exports = {
            apps: [
                {
                    name: '${appName}',
                    cwd: '${shipit.releasePath}',
                    script: 'yarn',
                    args: 'start',
                    interpreter: '/bin/bash',
                    watch: true,
                    autorestart: true,
                    restart_delay: 1000,
                    env: {
                        NODE_ENV: 'development'
                    },
                    env_production: {
                        NODE_ENV: 'production',
                        ADMIN_JWT_SECRET: '${process.env.ADMIN_JWT_SECRET}',
                        DATABASE_HOST: '${process.env.DATABASE_HOST}',
                        DATABASE_PORT: '${process.env.DATABASE_PORT}',
                        DATABASE_NAME: '${process.env.DATABASE_NAME}',
                        DATABASE_USERNAME: '${process.env.DATABASE_USERNAME}',
                        DATABASE_PASSWORD: '${process.env.DATABASE_PASSWORD}'
                    }
                }
            ]
        }
        `
        fs.writeFileSync('ecosystem.config.js', ecosystem, (err) => {
            if (err) throw err
            console.log('Successfully created ecosytem.conf.js')
        })

        await shipit.copyToRemote('ecosystem.config.js', ecosystemFilePath)
    })

    shipit.blTask('copy-build', async () => {
        await shipit.local(
            'NODE_ENV=production yarn build --clean'
        ).then(
            ({ stdout }) => console.log(stdout)
        ).catch(
            ({ stderr }) => console.log(stderr)
        )
        await shipit.copyToRemote('build', shipit.releasePath)
    })

    shipit.blTask('pm2-server', async () => {
        await shipit.remote(`~/.yarn/bin/pm2 delete -s ${appName} || :`)
        await shipit.remote(
            `~/.yarn/bin/pm2 start ${ecosystemFilePath} --env production --watch true`
        )
    })
}

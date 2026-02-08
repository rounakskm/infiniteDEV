module.exports = {
  apps: [
    {
      name: 'infinitedev-daemon',
      script: './src/daemon/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      exp_backoff_restart_delay: 100,
      min_uptime: '10s',
      max_restarts: 10,
      error_file: '.infinitedev/logs/daemon-error.log',
      out_file: '.infinitedev/logs/daemon-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      }
    },
    {
      name: 'infinitedev-health',
      script: './src/health/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      error_file: '.infinitedev/logs/health-error.log',
      out_file: '.infinitedev/logs/health-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        PORT: 3030,
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      }
    },
    {
      name: 'infinitedev-mayor',
      script: 'bash',
      args: ['-c', 'cd .gastown && gt mayor attach --loop --interval 30s'],
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '400M',
      error_file: '.infinitedev/logs/mayor-error.log',
      out_file: '.infinitedev/logs/mayor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      }
    }
  ]
};

# Lambda logs watcher

Watch logs from the terminal.

Supports:

* Terraform-managed functions
* function name argument
* function Arn argument

## Usage

```npx sashee/watch-lambda-logs <name|arn?>```

If no argument is provided it tries to use Terraform to find managed functions. If there are multiple, it offers a choice which one to watch.

Both function name (in the current region, defined in the ```AWS_REGION``` environment variable) or function Arn is supported.

import fetch from 'node-fetch';

let token = "glpat-vocNs7ApBU2oxxbttLgM"
const bot_url = "https://chat.googleapis.com/v1/spaces/AAAABBz5ukg/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=de0seD4UW8UbC8LPxfM2CwdlWK_uxxOpVjm0X6xXsNM%3D"
const baseUrl = 'https://hub.cardossier.net/api/v4/'

const runner_mode = "default"
const ORANGE = "#ffa500"
const RED = "#ff0000"
const GREEN = "#00ff00"


let defaultHeader = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + token,
    //'Accept': 'application/json',
}

fetch(baseUrl + 'merge_requests?' + new URLSearchParams({
    state: 'opened',
    scope: 'all',
    view: 'simple'
}), {
    method: 'GET',
    headers: defaultHeader
})
    .then(r => r.json())
    .then(pr_requests => get_extended_pr_requests(pr_requests));

//otherwise pipeline field is missing
async function get_extended_pr_requests(simple_pr_requests) {
    const extended_pr_requests = await Promise.all(simple_pr_requests.map((pr_request) => {
        return fetch(baseUrl + "projects/" + pr_request.project_id + "/merge_requests/" + pr_request.iid, {
            method: 'GET',
            headers: defaultHeader
        })
            .then(r => r.json())
    }))
    prepare_cards(extended_pr_requests)
}

function get_text_paragraph(header, text) {
    return "<font color=\"#616161\">" + header + ":" + "</font>" + "<br>" + text;
}

function get_text_line(description, text) {
    return description + ": " + text
}

function get_reviews(approval_settings) {
    if (approval_settings.rules.length == 0) {
        return "no approvals required"
    }
    //Assume there is always one rule
    return "[" + approval_settings.rules[0].approved_by.length + "/" + approval_settings.rules[0].approvals_required + "]"
}
function get_merge_readiness(pr_request, approval_settings) {
    let states = []
    //TODO: add functionality for more than one approval rule
    if (approval_settings.rules.length == 0 || approval_settings.rules[0].approved_by.length >= approval_settings.rules[0].approvals_required) {
        states.push({ name: "approvals", color: GREEN })
    } else {
        states.push({ name: "approvals", color: RED })
    }
    if (!pr_request.has_conflicts) {
        states.push({ name: "conflicts", color: GREEN })
    } else {
        states.push({ name: "conflicts", color: RED })
    }
    if (pr_request.pipeline) {
        let status = pr_request.pipeline.status
        if (status == "success" || status == "manual") {
            states.push({ name: "pipeline", color: GREEN })
        } else if (status == "pending") {
            states.push({ name: "pipeline", color: ORANGE })
        } else {
            states.push({ name: "pipeline", color: RED })
        }
    }
    return states
}


function get_age(pr_request) {
    let d1 = pr_request.updated_at.split("T")[0].split("-")
    let d2 = pr_request.updated_at.split("T")[1].split(":")
    let date = "" + d1[1] + "/" + d1[2] + "/" + d1[0] + " " + d2[0] + ":" + d2[1]
    var today = new Date();
    var createdOn = new Date(date);
    var msInDay = 24 * 60 * 60 * 1000;

    createdOn.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0)

    var diff = parseInt((+today - +createdOn) / msInDay, 10)
    return ("" + diff + " days go")
}



async function prepare_cards(pr_requests) {
    let cards = await Promise.all(pr_requests.map(async (pr_request) => {
        const approval_settings = await get_approval_settings(pr_request)
        let merge_readiness = get_merge_readiness(pr_request, approval_settings).map((item) => item.color == GREEN)
        if (runner_mode == "default" && ((!merge_readiness[1] || !merge_readiness[2]) || (merge_readiness[0] && merge_readiness[1] && merge_readiness[2]) || pr_request.draft)) {
            return null
        }
        const open_thread_authors = await get_open_thread_authors(pr_request)
        //const pipeline = await get_pipeline(pr_request)
        let widgets = []
        if (runner_mode == "extended") {
            widgets = prepare_extended_widgets(pr_request, approval_settings, open_thread_authors)
        } else if (runner_mode == "default") {
            widgets = prepare_simple_widgets(pr_request, approval_settings, open_thread_authors)
        }

        return {
            header: {
                title: pr_request.title,
                subtitle: pr_request.references.full.split("!")[0]
            },
            sections: { widgets: widgets }
        }
    }))
    send_cards_to_chat(cards.filter((card) => card != null))
}

function prepare_simple_widgets(pr_request, approval_settings, open_thread_authors) {
    let widgets = [{
        textParagraph: {
            text: get_text_line("Approvals", get_reviews(approval_settings))
        }
    }, {
        buttons: [{
            textButton: {
                text: "<font color=\"#0645AD\">" + "View Merge Request" + "</font>",
                onClick: {
                    openLink: {
                        url: pr_request.web_url
                    }
                }
            }
        }]
    }]

    if (open_thread_authors != undefined && open_thread_authors.length > 0) {
        widgets.splice(1, 0, {
            textParagraph: {
                text: get_text_paragraph("Discussion Participants:", open_thread_authors.reduce((output, author) => {
                    output += author + ", "
                    return output
                }, "").slice(0, -2))
            }
        })
    }
    return widgets

}

function prepare_extended_widgets(pr_request, approval_settings, open_thread_authors) {
    let widgets = [{
        textParagraph: {
            text: get_text_paragraph("Last update", get_age(pr_request))
        }
    }, {
        textParagraph: {
            text: get_text_paragraph("Approvals", get_reviews(approval_settings))
        }
    }, {
        textParagraph: {
            text: get_text_paragraph("Commited by", pr_request.author.name)
        }
    }, {
        textParagraph: {
            text: get_text_paragraph("Merge Readiness", get_merge_readiness(pr_request, approval_settings).reduce((output, state) => {
                return output + "<font color=\"" + state.color + "\">" + state.name + "</font>" + ", "
            }, "").slice(0, -2))
        }
    }, {
        buttons: [{
            textButton: {
                text: "<font color=\"#0645AD\">" + "View Merge Request" + "</font>",
                onClick: {
                    openLink: {
                        url: pr_request.web_url
                    }
                }
            }
        }]
    }]

    if (open_thread_authors != undefined && open_thread_authors.length > 0) {
        widgets.splice(3, 0, {
            textParagraph: {
                text: get_text_paragraph("Discussion Participants:", open_thread_authors.reduce((output, author) => {
                    output += author + ", "
                    return output
                }, "").slice(0, -2))
            }
        })
    }

    return widgets

}

async function get_open_thread_authors(pr_request) {
    let project_id = pr_request.project_id
    let merge_id = pr_request.iid

    return fetch(baseUrl + "/projects/" + project_id + "/merge_requests/" + merge_id + "/discussions", {
        method: 'GET',
        headers: defaultHeader,
    })
        .then((r) => r.json())
        .then((discussions) => {
            return discussions.map((discussion) => {
                if (discussion.notes.length > 0) {
                    return discussion.notes.map((note) => {
                        if (note.resolvable && !note.resolved) {
                            return note.author.name
                        }
                        return null
                    }).filter((author) => author != null)
                }
                return null
            }).reduce((output, discussion_authors) => {
                if (discussion_authors && discussion_authors.length != 0) {
                    for (let i = 0; i < discussion_authors.length; i++) {
                        output.push(discussion_authors[i])
                    }
                    return output
                }
                return output
            }, []).filter(
                (author, index, self) => self.indexOf(author) == index
            )
            /*.filter(
                (nested_discussion_authors) => discussion != null)
                .filter(
                    (discussion, index, self) => self.indexOf(discussion) == index
                )
                */
        })

}

async function get_approval_settings(pr_request) {
    let project_id = pr_request.project_id
    let merge_id = pr_request.iid
    return fetch(baseUrl + "/projects/" + project_id + "/merge_requests/" + merge_id + "/approval_settings", {
        method: 'GET',
        headers: defaultHeader,
    })
        .then((r) => r.json())
}

function send_cards_to_chat(cards) {
    fetch(bot_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
            cards: cards
        })
    })
        .then(r => r.json())
        .then(data => {
            console.log("Response: ", data)
        })
}



const core = require('@actions/core');
const github = require('@actions/github');

const main = async () => {
    try {
        /**
         * We need to fetch all the inputs that were provided to our action
         * and store them in variables for us to use.
         **/
        const owner = core.getInput('owner', { required: true });
        const repo = core.getInput('repo', { required: true });
        const pr_number = core.getInput('pr_number', { required: true });
        const token = core.getInput('token', { required: true });

        /**
         * Now we need to create an instance of Octokit which will use to call
         * GitHub's REST API endpoints.
         * We will pass the token as an argument to the constructor. This token
         * will be used to authenticate our requests.
         * You can find all the information about how to use Octokit here:
         * https://octokit.github.io/rest.js/v18
         **/
        const octokit = new github.getOctokit(token);

        /**
         * We need to fetch the list of files that were changes in the Pull Request
         * and store them in a variable.
         * We use octokit.paginate() to automatically loop over all the pages of the
         * results.
         * Reference: https://octokit.github.io/rest.js/v18#pulls-list-files
         */
        const { data: changedFiles } = await octokit.rest.pulls.listFiles({
            owner,
            repo,
            pull_number: pr_number,
        });


        /**
         * Contains the sum of all the additions, deletions, and changes
         * in all the files in the Pull Request.
         **/
        let diffData = {
            additions: 0,
            deletions: 0,
            changes: 0
        };

        // Reference for how to use Array.reduce():
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce
        diffData = changedFiles.reduce((acc, file) => {
            acc.additions += file.additions;
            acc.deletions += file.deletions;
            acc.changes += file.changes;
            return acc;
        }, diffData);

        /**
         * Loop over all the files changed in the PR and add labels according
         * to files types.
         **/
        for (const file of changedFiles) {
            /**
             * Add labels according to file types.
             */
            const fileExtension = file.filename.split('.').pop();
            switch(fileExtension) {
                case 'md':
                    await octokit.rest.issues.addLabels({
                        owner,
                        repo,
                        issue_number: pr_number,
                        labels: ['markdown'],
                    });
                case 'js':
                    await octokit.rest.issues.addLabels({
                        owner,
                        repo,
                        issue_number: pr_number,
                        labels: ['javascript'],
                    });
                case 'yml':
                    await octokit.rest.issues.addLabels({
                        owner,
                        repo,
                        issue_number: pr_number,
                        labels: ['yaml'],
                    });
                case 'yaml':
                    await octokit.rest.issues.addLabels({
                        owner,
                        repo,
                        issue_number: pr_number,
                        labels: ['yaml'],
                    });
            }
        }

        /**
         * Create a comment on the PR with the information we compiled from the
         * list of changed files.
         */
        await octokit.rest.issues.createComment({
            owner,
            repo,
            issue_number: pr_number,
            body: `
        Pull Request #${pr_number} has been updated with: \n
        - ${diffData.changes} changes \n
        - ${diffData.additions} additions \n
        - ${diffData.deletions} deletions \n
      `
        });

    } catch (error) {
        core.setFailed(error.message);
    }
}

// Call the main function to run the action
main();